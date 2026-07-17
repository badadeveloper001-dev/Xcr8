from __future__ import annotations

from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
import hashlib
import hmac
import re
import smtplib

import httpx
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import PulseAffectedUser, PulseEvent, PulseIncident, PulseNotification, User

FOUNDER_NOTIFY_COOLDOWN_MINUTES = 30


class PulseInput(dict):
    pass


def _clean_text(value: object, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback


def _normalize_detail(detail: str) -> str:
    normalized = re.sub(r"[0-9]+", "#", _clean_text(detail, "Unknown error"))
    normalized = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+", "[email]", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized[:220]


def detect_feature(route: str | None) -> str:
    path = _clean_text(route, "unknown").lower()
    mapping = [
        ("/api/v1/auth/login", "login"),
        ("/api/v1/auth/signup", "signup"),
        ("/api/v1/auth", "auth"),
        ("/api/v1/ai/voiceover", "voiceover"),
        ("/api/v1/ai/compose", "compose"),
        ("/api/v1/ai/brainstorm", "brainstorm"),
        ("/api/v1/ai", "ai_generation"),
        ("/api/v1/upload", "upload"),
        ("/api/v1/scheduling", "scheduling"),
        ("/api/v1/social/publish", "publishing"),
        ("/api/v1/distribution", "distribution"),
        ("/api/v1/platforms", "platforms"),
        ("/api/v1/dashboard", "dashboard"),
        ("/api/v1/admin", "admin"),
        ("/health/db", "database"),
    ]
    for prefix, feature in mapping:
        if path.startswith(prefix):
            return feature
    return "unknown"


def detect_provider(detail: str, route: str | None = None) -> str | None:
    haystack = f"{_clean_text(route)} {_clean_text(detail)}".lower()
    provider_map = {
        "openai": "OpenAI",
        "supabase": "Supabase",
        "s3": "S3",
        "cloudflare": "Cloudflare",
        "redis": "Redis",
        "smtp": "SMTP",
        "email service": "SMTP",
        "discord": "Discord",
        "slack": "Slack",
        "postgres": "Postgres",
        "database": "Database",
        "storage": "Storage",
        "vercel": "Vercel",
    }
    for token, provider in provider_map.items():
        if token in haystack:
            return provider
    return None


def classify_error(http_status: int | None, detail: str, route: str | None, event_type: str = "error") -> tuple[str, str]:
    status = int(http_status or 0)
    lowered = _clean_text(detail).lower()
    provider = detect_provider(detail, route)

    if event_type == "slow_response":
        return "system_error", "medium"
    if provider and provider not in {"Database"} and status in {0, 500, 502, 503, 504}:
        return "third_party_error", "high"
    if provider and provider in {"OpenAI", "Supabase", "Storage", "SMTP", "Discord", "Slack"}:
        return "third_party_error", "high" if status >= 500 else "medium"
    if status >= 500 or any(token in lowered for token in ["timeout", "connection", "database", "unavailable", "internal"]):
        severity = "critical" if "database" in lowered or detect_feature(route) in {"auth", "login", "signup", "database"} else "high"
        return "system_error", severity
    if status in {408, 429}:
        return "system_error", "medium"
    return "user_error", "low"


def build_title(feature: str, event_type: str, http_status: int | None, detail: str) -> str:
    if event_type == "slow_response":
        return f"Slow response detected in {feature.replace('_', ' ')}"
    if http_status and http_status >= 500:
        return f"{feature.replace('_', ' ').title()} failure"
    if http_status == 401 and feature in {"login", "auth"}:
        return "Login failure"
    if http_status == 413 and feature == "upload":
        return "Upload size rejection"
    return f"{feature.replace('_', ' ').title()} issue"


def build_possible_reason(detail: str, provider: str | None, error_type: str) -> str:
    if provider:
        return f"Possible issue with {provider} or its integration path."
    if error_type == "user_error":
        return "Likely invalid input or user action."
    if "timeout" in detail.lower():
        return "Request timed out before the service returned a result."
    if "database" in detail.lower():
        return "Database connectivity or query execution issue."
    return "Unexpected service behavior or internal application error."


def build_fingerprint(feature: str, error_type: str, provider: str | None, http_status: int | None, detail: str) -> str:
    payload = f"{feature}|{error_type}|{provider or 'none'}|{http_status or 0}|{_normalize_detail(detail)}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:40]


def _send_email(subject: str, body: str, recipients: list[str]) -> tuple[bool, str]:
    host = str(settings.smtp_host or "").strip()
    username = str(settings.smtp_username or "").strip()
    password = str(settings.smtp_password or "").strip()
    from_email = str(settings.smtp_from_email or "").strip()
    if not host or not username or not password or not from_email or not recipients:
        return False, "SMTP not configured"

    message = EmailMessage()
    sender_name = str(settings.smtp_from_name or "XCR8").strip() or "XCR8"
    message["Subject"] = subject
    message["From"] = f"{sender_name} <{from_email}>"
    message["To"] = ", ".join(recipients)
    message.set_content(body)

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(host, settings.smtp_port, timeout=15) as server:
                server.login(username, password)
                server.send_message(message)
        else:
            with smtplib.SMTP(host, settings.smtp_port, timeout=15) as server:
                server.ehlo()
                if settings.smtp_use_tls:
                    server.starttls()
                    server.ehlo()
                server.login(username, password)
                server.send_message(message)
        return True, "sent"
    except OSError as exc:
        return False, str(exc)


def _record_notification(
    db: Session,
    incident_id: int,
    channel: str,
    notification_type: str,
    target: str,
    delivery_status: str,
    response_meta: dict | None = None,
) -> None:
    db.add(
        PulseNotification(
            incident_id=incident_id,
            channel=channel,
            notification_type=notification_type,
            target=target,
            delivery_status=delivery_status,
            response_meta=response_meta or {},
        )
    )


def notify_founders(db: Session, incident: PulseIncident) -> None:
    now = datetime.now(tz=UTC)
    if incident.last_founder_notified_at and (now - incident.last_founder_notified_at) < timedelta(minutes=FOUNDER_NOTIFY_COOLDOWN_MINUTES):
        return

    admin_link = f"{str(settings.frontend_url or '').rstrip('/')}/admin/dashboard" if settings.frontend_url else "/admin/dashboard"
    subject = f"[Pulse] {incident.severity.upper()} - {incident.title}"
    body = (
        f"XCR8 Pulse detected an incident.\n\n"
        f"Feature: {incident.feature}\n"
        f"Severity: {incident.severity}\n"
        f"Type: {incident.error_type}\n"
        f"Provider: {incident.provider or 'N/A'}\n"
        f"Affected users: {incident.affected_users_count}\n"
        f"Total events: {incident.total_events_count}\n"
        f"First seen: {incident.first_seen_at.isoformat() if incident.first_seen_at else 'N/A'}\n"
        f"Last seen: {incident.last_seen_at.isoformat() if incident.last_seen_at else 'N/A'}\n"
        f"Possible reason: {incident.possible_reason}\n\n"
        f"Admin: {admin_link}\n"
    )

    founder_emails = [item.strip() for item in str(getattr(settings, "founder_alert_emails", "") or "").split(",") if item.strip()]
    if founder_emails:
        sent, response = _send_email(subject, body, founder_emails)
        for email in founder_emails:
            _record_notification(
                db,
                incident.id,
                "email",
                "founder_alert",
                email,
                "sent" if sent else "failed",
                {"response": response},
            )

    webhook_payload = {
        "text": (
            f"Pulse alert: {incident.title}\n"
            f"Feature: {incident.feature} | Severity: {incident.severity} | Users: {incident.affected_users_count}\n"
            f"Reason: {incident.possible_reason}"
        )
    }
    for channel, target in [
        ("slack", str(getattr(settings, "pulse_slack_webhook_url", "") or "").strip()),
        ("discord", str(getattr(settings, "pulse_discord_webhook_url", "") or "").strip()),
    ]:
        if not target:
            continue
        try:
            response = httpx.post(target, json=webhook_payload, timeout=10.0)
            response.raise_for_status()
            _record_notification(db, incident.id, channel, "founder_alert", target, "sent", {"status": response.status_code})
        except Exception as exc:
            _record_notification(db, incident.id, channel, "founder_alert", target, "failed", {"error": str(exc)[:200]})

    incident.last_founder_notified_at = now
    db.add(incident)


def notify_affected_user_issue(db: Session, incident: PulseIncident, affected_user: PulseAffectedUser) -> None:
    if affected_user.notified_issue_at or not affected_user.email:
        return

    subject = "We noticed an issue while you were using XCR8"
    body = (
        "Hi,\n\n"
        "We noticed that you experienced an issue while using XCR8.\n\n"
        "Our system has already detected the problem and our team has been notified automatically.\n"
        "We are currently working to resolve it.\n\n"
        "You do not need to submit another report.\n"
        "We will notify you as soon as everything is working normally again.\n\n"
        "Thank you for your patience.\n"
        "The XCR8 Team\n"
    )
    sent, response = _send_email(subject, body, [affected_user.email])
    _record_notification(
        db,
        incident.id,
        "email",
        "user_issue",
        affected_user.email,
        "sent" if sent else "failed",
        {"response": response},
    )
    if sent:
        affected_user.notified_issue_at = datetime.now(tz=UTC)
        db.add(affected_user)


def notify_affected_users_resolved(db: Session, incident: PulseIncident) -> None:
    for affected_user in incident.affected_users:
        if affected_user.notified_resolved_at or not affected_user.email:
            continue
        subject = "Good news: your XCR8 issue has been resolved"
        body = (
            "Hi,\n\n"
            "Good news.\n\n"
            "The issue affecting your request has now been resolved.\n"
            "Everything is working normally again.\n\n"
            "Thank you for your patience and for using XCR8.\n"
            "The XCR8 Team\n"
        )
        sent, response = _send_email(subject, body, [affected_user.email])
        _record_notification(
            db,
            incident.id,
            "email",
            "user_resolved",
            affected_user.email,
            "sent" if sent else "failed",
            {"response": response},
        )
        if sent:
            affected_user.notified_resolved_at = datetime.now(tz=UTC)
            affected_user.status = "resolved"
            db.add(affected_user)


def record_pulse_event(db: Session, payload: dict) -> PulseEvent:
    event_type = _clean_text(payload.get("event_type"), "error")
    route = _clean_text(payload.get("route")) or None
    feature = _clean_text(payload.get("feature")) or detect_feature(route)
    detail = _clean_text(payload.get("detail"), "Unexpected error")
    provider = _clean_text(payload.get("provider")) or detect_provider(detail, route)
    http_status = int(payload.get("http_status") or 0) or None
    error_type, severity = classify_error(http_status, detail, route, event_type)
    title = build_title(feature, event_type, http_status, detail)
    fingerprint = build_fingerprint(feature, error_type, provider, http_status, detail)
    now = datetime.now(tz=UTC)
    user_email = _clean_text(payload.get("affected_user_email")) or None
    user_id = payload.get("user_id")
    should_escalate = error_type in {"system_error", "third_party_error"}

    incident: PulseIncident | None = None
    if should_escalate:
        incident = db.scalar(select(PulseIncident).where(PulseIncident.fingerprint == fingerprint))
        if not incident:
            incident = PulseIncident(
                fingerprint=fingerprint,
                feature=feature,
                error_type=error_type,
                severity=severity,
                provider=provider,
                title=title,
                possible_reason=build_possible_reason(detail, provider, error_type),
                status="investigating",
                total_events_count=0,
                affected_users_count=0,
                first_seen_at=now,
                last_seen_at=now,
                incident_meta=payload.get("event_meta") or {},
            )
            db.add(incident)
            db.flush()
        else:
            incident.last_seen_at = now
            incident.status = "investigating" if incident.status == "fixed" else incident.status
            incident.severity = severity if incident.severity != "critical" else incident.severity
            incident.possible_reason = build_possible_reason(detail, provider, error_type)
            db.add(incident)

        incident.total_events_count += 1
        if incident.first_seen_at is None:
            incident.first_seen_at = now
        incident.last_seen_at = now

    event = PulseEvent(
        incident_id=incident.id if incident else None,
        user_id=int(user_id) if user_id is not None else None,
        event_type=event_type,
        feature=feature,
        error_type=error_type,
        severity=severity,
        provider=provider or None,
        title=title,
        detail=detail,
        route=route,
        method=_clean_text(payload.get("method")) or None,
        http_status=http_status,
        request_id=_clean_text(payload.get("request_id")) or None,
        fingerprint=fingerprint,
        response_ms=int(payload.get("response_ms") or 0) or None,
        affected_user_email=user_email,
        event_meta=payload.get("event_meta") or {},
    )
    db.add(event)
    db.flush()

    if incident and user_email:
        affected_user = db.scalar(
            select(PulseAffectedUser).where(
                PulseAffectedUser.incident_id == incident.id,
                PulseAffectedUser.email == user_email,
            )
        )
        if not affected_user:
            resolved_user = None
            if user_id is not None:
                resolved_user = db.get(User, int(user_id))
            elif user_email:
                resolved_user = db.scalar(select(User).where(User.email == user_email))
            affected_user = PulseAffectedUser(
                incident_id=incident.id,
                user_id=resolved_user.id if resolved_user else (int(user_id) if user_id is not None else None),
                email=user_email,
                latest_event_at=now,
            )
            incident.affected_users_count += 1
            db.add(affected_user)
        else:
            affected_user.latest_event_at = now
            db.add(affected_user)
        notify_affected_user_issue(db, incident, affected_user)
        notify_founders(db, incident)
    elif incident:
        notify_founders(db, incident)

    db.commit()
    db.refresh(event)
    return event


def resolve_pulse_incident(db: Session, incident_id: int, resolution_summary: str | None = None) -> PulseIncident | None:
    incident = db.get(PulseIncident, incident_id)
    if not incident:
        return None
    incident.status = "fixed"
    incident.resolved_at = datetime.now(tz=UTC)
    incident.resolution_summary = _clean_text(resolution_summary) or "Marked fixed from admin dashboard."
    db.add(incident)
    notify_affected_users_resolved(db, incident)
    db.commit()
    db.refresh(incident)
    return incident


def sign_internal_pulse_token(timestamp: str) -> str:
    secret = str(getattr(settings, "pulse_internal_token", "") or "").strip()
    if not secret:
        return ""
    digest = hmac.new(secret.encode("utf-8"), timestamp.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest
