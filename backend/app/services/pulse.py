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
from app.db.models import IntelligenceNotification, PulseAffectedUser, PulseEvent, PulseIncident, PulseNotification, User

FOUNDER_NOTIFY_COOLDOWN_MINUTES = 30
AUTO_RESOLVE_MINUTES = 3
AUTO_RESOLVE_MAX_EVENTS = 5
RECOVERY_STABILITY_MINUTES = 10
RECOVERY_REQUIRED_SUCCESSES = 3

BENIGN_SLOW_ROUTE_PREFIXES = (
    "/api/v1/intelligence/feed",
    "/api/v1/dashboard/overview",
    "/api/v1/platforms/",
    "/api/v1/social/oauth/providers",
    "/api/v1/auth/session/",
)


class PulseInput(dict):
    pass


def _clean_text(value: object, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback


def _redact_sensitive_detail(detail: object) -> str:
    """Remove common credentials and personal identifiers before Pulse persists an error."""
    redacted = _clean_text(detail, "Unexpected error")
    redacted = re.sub(r"(?i)bearer\s+[a-z0-9._~+\-/=]+", "Bearer [redacted]", redacted)
    redacted = re.sub(
        r"(?i)(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret)\s*[:=]\s*[^\s,;]+",
        r"\1=[redacted]",
        redacted,
    )
    redacted = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[email]", redacted)
    redacted = re.sub(r"(?i)([?&](?:token|key|secret|password)=)[^&\s]+", r"\1[redacted]", redacted)
    redacted = re.sub(r"\s+", " ", redacted).strip()
    return redacted[:4000]


def _normalize_detail(detail: str) -> str:
    normalized = re.sub(r"[0-9]+", "#", _redact_sensitive_detail(detail))
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized[:220]


def detect_feature(route: str | None) -> str:
    path = _clean_text(route, "unknown").lower()
    mapping = [
        ("/api/v1/auth/login", "login"),
        ("/api/v1/auth/signup", "signup"),
        ("/api/v1/auth", "auth"),
        ("/api/v1/ai/voiceover", "voiceover"),
        ("/api/v1/ai/image", "image_generation"),
        ("/api/v1/ai/video", "video_generation"),
        ("/api/v1/ai/compose", "compose"),
        ("/api/v1/ai/brainstorm", "brainstorm"),
        ("/api/v1/ai", "ai_generation"),
        ("/api/v1/upload", "upload"),
        ("/api/v1/storage", "upload"),
        ("/api/v1/scheduling/dispatch", "scheduling_dispatch"),
        ("/api/v1/scheduling", "scheduling"),
        ("/api/v1/social/publish", "publishing"),
        ("/api/v1/social/oauth", "social_connection"),
        ("/api/v1/distribution", "distribution"),
        ("/api/v1/platforms", "platforms"),
        ("/api/v1/plans/webhook", "payment"),
        ("/api/v1/plans", "billing"),
        ("/api/v1/intelligence", "intelligence"),
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


def is_benign_slow_route(route: str | None, method: str | None = None) -> bool:
    path = _clean_text(route, "").lower()
    request_method = _clean_text(method, "GET").upper()
    if not path.startswith("/api/v1"):
        return False
    if path.startswith("/api/v1/admin"):
        return True
    if request_method != "GET":
        return False
    return any(path.startswith(prefix) for prefix in BENIGN_SLOW_ROUTE_PREFIXES)


def classify_error(
    http_status: int | None,
    detail: str,
    route: str | None,
    event_type: str = "error",
    method: str | None = None,
) -> tuple[str, str]:
    status = int(http_status or 0)
    lowered = _clean_text(detail).lower()
    provider = detect_provider(detail, route)

    if event_type == "slow_response":
        if status < 400 and is_benign_slow_route(route, method):
            return "user_error", "low"
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


def escalate_severity(current: str, events: int, affected_users: int) -> str:
    """Raise, never lower, the severity of a repeated incident."""
    rank = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    proposed = current
    if events >= 20 or affected_users >= 10:
        proposed = "critical"
    elif events >= 5 or affected_users >= 3:
        proposed = "high"
    return proposed if rank.get(proposed, 0) > rank.get(current, 0) else current


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

    admin_link = f"{str(settings.frontend_url or '').rstrip('/')}/admin/dashboard/pulse" if settings.frontend_url else "/admin/dashboard/pulse"
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
    attempted_delivery = False
    if founder_emails:
        attempted_delivery = True
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
        attempted_delivery = True
        try:
            channel_payload = (
                {"content": webhook_payload["text"]}
                if channel == "discord"
                else webhook_payload
            )
            response = httpx.post(target, json=channel_payload, timeout=10.0)
            response.raise_for_status()
            _record_notification(db, incident.id, channel, "founder_alert", target, "sent", {"status": response.status_code})
        except Exception as exc:
            _record_notification(db, incident.id, channel, "founder_alert", target, "failed", {"error": str(exc)[:200]})

    if attempted_delivery:
        incident.last_founder_notified_at = now
        db.add(incident)


def notify_founders_fallback(
    title: str,
    detail: str,
    *,
    feature: str = "platform",
    severity: str = "critical",
    request_id: str | None = None,
) -> None:
    """Alert founders without the application database when Pulse persistence itself fails."""
    safe_detail = _redact_sensitive_detail(detail)
    subject = f"[Pulse fallback] {severity.upper()} - {title}"
    body = (
        "XCR8 Pulse could not persist a platform failure.\n\n"
        f"Feature: {feature}\n"
        f"Severity: {severity}\n"
        f"Request ID: {request_id or 'N/A'}\n"
        f"Detail: {safe_detail}\n"
    )
    founder_emails = [
        item.strip()
        for item in str(getattr(settings, "founder_alert_emails", "") or "").split(",")
        if item.strip()
    ]
    if founder_emails:
        _send_email(subject, body, founder_emails)

    payload = {"text": f"{subject}\nFeature: {feature}\nRequest: {request_id or 'N/A'}\n{safe_detail}"}
    for channel, target in [
        ("slack", str(getattr(settings, "pulse_slack_webhook_url", "") or "").strip()),
        ("discord", str(getattr(settings, "pulse_discord_webhook_url", "") or "").strip()),
    ]:
        if not target:
            continue
        try:
            channel_payload = {"content": payload["text"]} if channel == "discord" else payload
            response = httpx.post(target, json=channel_payload, timeout=8.0)
            response.raise_for_status()
        except Exception:
            continue


def _notification_exists(
    db: Session,
    incident_id: int,
    channel: str,
    notification_type: str,
    target: str,
) -> bool:
    return bool(
        db.scalar(
            select(PulseNotification.id).where(
                PulseNotification.incident_id == incident_id,
                PulseNotification.channel == channel,
                PulseNotification.notification_type == notification_type,
                PulseNotification.target == target,
                PulseNotification.delivery_status == "sent",
            )
        )
    )


def _create_in_app_notification(
    db: Session,
    incident: PulseIncident,
    affected_user: PulseAffectedUser,
    notification_type: str,
    title: str,
    body: str,
    severity: str,
) -> bool:
    if not affected_user.user_id:
        return False
    target = str(affected_user.user_id)
    if _notification_exists(db, incident.id, "in_app", notification_type, target):
        return True

    notification = IntelligenceNotification(
        user_id=affected_user.user_id,
        title=title[:220],
        body=body,
        severity=severity,
        related_topic=f"Pulse incident #{incident.id}",
        is_read=False,
    )
    db.add(notification)
    db.flush()
    _record_notification(
        db,
        incident.id,
        "in_app",
        notification_type,
        target,
        "sent",
        {"notification_id": notification.id},
    )
    return True


def notify_affected_user_issue(db: Session, incident: PulseIncident, affected_user: PulseAffectedUser) -> None:
    user = db.get(User, affected_user.user_id) if affected_user.user_id else None
    display_name = _clean_text(user.display_name if user else None, "Creator")
    request_reference = f" Reference: Pulse #{incident.id}."

    delivered_in_app = _create_in_app_notification(
        db,
        incident,
        affected_user,
        "user_issue",
        f"We noticed an issue with {incident.feature.replace('_', ' ')}",
        (
            f"Hi {display_name}, Xcr8 detected a problem while handling your request. "
            "Our team has been notified and you do not need to submit another report."
            f"{request_reference} We will notify you here when service is stable again."
        ),
        "high" if incident.severity in {"high", "critical"} else "medium",
    )

    delivered_email = False
    email_enabled = bool(getattr(settings, "pulse_user_email_enabled", False))
    if email_enabled and affected_user.email:
        target = affected_user.email
        if _notification_exists(db, incident.id, "email", "user_issue", target):
            delivered_email = True
        else:
            subject = "We noticed an issue while you were using XCR8"
            body = (
                f"Hi {display_name},\n\n"
                "We noticed that you experienced an issue while using XCR8.\n\n"
                "Our system detected the problem and our team has been notified. "
                f"Your reference is Pulse #{incident.id}.\n"
                "We will notify you as soon as everything is stable again.\n\n"
                "Thank you for your patience.\n"
                "The XCR8 Team\n"
            )
            sent, response = _send_email(subject, body, [target])
            _record_notification(
                db,
                incident.id,
                "email",
                "user_issue",
                target,
                "sent" if sent else "failed",
                {"response": response},
            )
            delivered_email = sent

    if delivered_in_app or delivered_email:
        affected_user.notified_issue_at = affected_user.notified_issue_at or datetime.now(tz=UTC)
        db.add(affected_user)

def notify_affected_users_resolved(db: Session, incident: PulseIncident) -> None:
    for affected_user in incident.affected_users:
        user = db.get(User, affected_user.user_id) if affected_user.user_id else None
        display_name = _clean_text(user.display_name if user else None, "Creator")

        delivered_in_app = _create_in_app_notification(
            db,
            incident,
            affected_user,
            "user_resolved",
            f"{incident.feature.replace('_', ' ').title()} is working normally again",
            (
                f"Hi {display_name}, the issue tracked as Pulse #{incident.id} has been resolved "
                "and Xcr8 is working normally again. Thank you for your patience."
            ),
            "info",
        )

        delivered_email = False
        email_enabled = bool(getattr(settings, "pulse_user_email_enabled", False))
        if email_enabled and affected_user.email:
            target = affected_user.email
            if _notification_exists(db, incident.id, "email", "user_resolved", target):
                delivered_email = True
            else:
                subject = "Good news: your XCR8 issue has been resolved"
                body = (
                    f"Hi {display_name},\n\n"
                    f"The issue tracked as Pulse #{incident.id} has been resolved.\n"
                    "Everything is working normally again.\n\n"
                    "Thank you for your patience and for using XCR8.\n"
                    "The XCR8 Team\n"
                )
                sent, response = _send_email(subject, body, [target])
                _record_notification(
                    db,
                    incident.id,
                    "email",
                    "user_resolved",
                    target,
                    "sent" if sent else "failed",
                    {"response": response},
                )
                delivered_email = sent

        if delivered_in_app or delivered_email:
            affected_user.notified_resolved_at = affected_user.notified_resolved_at or datetime.now(tz=UTC)
            affected_user.status = "resolved"
            db.add(affected_user)

def record_pulse_event(db: Session, payload: dict) -> PulseEvent:
    event_type = _clean_text(payload.get("event_type"), "error")
    route = _clean_text(payload.get("route")) or None
    request_method = _clean_text(payload.get("method")) or None
    feature = _clean_text(payload.get("feature")) or detect_feature(route)
    detail = _redact_sensitive_detail(payload.get("detail"))
    provider = _clean_text(payload.get("provider")) or detect_provider(detail, route)
    http_status = int(payload.get("http_status") or 0) or None
    error_type, severity = classify_error(http_status, detail, route, event_type, request_method)
    title = build_title(feature, event_type, http_status, detail)
    fingerprint = build_fingerprint(feature, error_type, provider, http_status, detail)
    now = datetime.now(tz=UTC)
    user_email = _clean_text(payload.get("affected_user_email")) or None
    raw_user_id = payload.get("user_id")
    try:
        user_id = int(raw_user_id) if raw_user_id is not None else None
    except (TypeError, ValueError):
        user_id = None

    resolved_user = db.get(User, user_id) if user_id is not None else None
    if not resolved_user and user_email:
        resolved_user = db.scalar(select(User).where(User.email == user_email))
    if resolved_user:
        user_id = resolved_user.id
        user_email = resolved_user.email

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
            if incident.status in {"fixed", "monitoring"}:
                meta = dict(incident.incident_meta or {})
                timeline = list(meta.get("timeline") or [])
                timeline.append({"type": "reopened", "created_at": now.isoformat()})
                meta["timeline"] = timeline[-40:]
                meta.pop("recovery_started_at", None)
                meta.pop("recovery_successes", None)
                incident.incident_meta = meta
                incident.status = "investigating"
                incident.resolved_at = None
                incident.resolution_summary = None
            severity_rank = {"low": 0, "medium": 1, "high": 2, "critical": 3}
            if severity_rank.get(severity, 0) > severity_rank.get(incident.severity, 0):
                incident.severity = severity
            incident.possible_reason = build_possible_reason(detail, provider, error_type)
            db.add(incident)

        incident.total_events_count += 1
        incident.severity = escalate_severity(
            incident.severity,
            incident.total_events_count,
            incident.affected_users_count,
        )
        if incident.first_seen_at is None:
            incident.first_seen_at = now
        incident.last_seen_at = now

    event = PulseEvent(
        incident_id=incident.id if incident else None,
        user_id=user_id,
        event_type=event_type,
        feature=feature,
        error_type=error_type,
        severity=severity,
        provider=provider or None,
        title=title,
        detail=detail,
        route=route,
        method=request_method,
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
            affected_user = PulseAffectedUser(
                incident_id=incident.id,
                user_id=resolved_user.id if resolved_user else user_id,
                email=user_email,
                latest_event_at=now,
            )
            incident.affected_users_count += 1
            incident.severity = escalate_severity(
                incident.severity,
                incident.total_events_count,
                incident.affected_users_count,
            )
            db.add(affected_user)
        else:
            affected_user.latest_event_at = now
            if not affected_user.user_id and resolved_user:
                affected_user.user_id = resolved_user.id
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


def auto_resolve_stable_incidents(
    db: Session,
    route: str | None,
    method: str | None,
    response_status: int,
) -> list[PulseIncident]:
    if response_status >= 400:
        return []

    feature = detect_feature(route)
    if feature == "unknown":
        return []

    now = datetime.now(tz=UTC)
    cutoff = now - timedelta(minutes=AUTO_RESOLVE_MINUTES)
    incidents = list(
        db.scalars(
            select(PulseIncident)
            .where(
                PulseIncident.status.in_({"investigating", "monitoring"}),
                PulseIncident.resolved_at.is_(None),
                PulseIncident.feature == feature,
                PulseIncident.severity.in_({"low", "medium"}),
                PulseIncident.total_events_count <= AUTO_RESOLVE_MAX_EVENTS,
                PulseIncident.last_seen_at <= cutoff,
            )
            .order_by(desc(PulseIncident.last_seen_at))
            .limit(3)
        )
    )

    resolved: list[PulseIncident] = []
    method_label = _clean_text(method, "request").upper()
    route_label = _clean_text(route, "this route")
    for incident in incidents:
        meta = dict(incident.incident_meta or {})
        timeline = list(meta.get("timeline") or [])
        recovery_started_raw = _clean_text(meta.get("recovery_started_at"))
        recovery_started = None
        if recovery_started_raw:
            try:
                recovery_started = datetime.fromisoformat(recovery_started_raw)
            except ValueError:
                recovery_started = None
        if recovery_started and recovery_started.tzinfo is None:
            recovery_started = recovery_started.replace(tzinfo=UTC)

        if not recovery_started:
            recovery_started = now
            meta["recovery_started_at"] = now.isoformat()
            meta["recovery_successes"] = 1
            timeline.append(
                {
                    "type": "monitoring",
                    "created_at": now.isoformat(),
                    "detail": f"Healthy {method_label} traffic resumed on {route_label}.",
                }
            )
        else:
            meta["recovery_successes"] = int(meta.get("recovery_successes") or 0) + 1

        incident.status = "monitoring"
        meta["timeline"] = timeline[-40:]
        incident.incident_meta = meta
        db.add(incident)

        stable_for = now - recovery_started
        if (
            int(meta.get("recovery_successes") or 0) >= RECOVERY_REQUIRED_SUCCESSES
            and stable_for >= timedelta(minutes=RECOVERY_STABILITY_MINUTES)
        ):
            summary = (
                f"Auto-resolved after {int(meta.get('recovery_successes') or 0)} healthy requests "
                f"and {RECOVERY_STABILITY_MINUTES} minutes of stable traffic on {route_label}."
            )
            resolved_incident = resolve_pulse_incident(db, incident.id, summary)
            if resolved_incident:
                resolved.append(resolved_incident)

    if incidents and not resolved:
        db.commit()
    return resolved

def sign_internal_pulse_token(timestamp: str) -> str:
    secret = str(getattr(settings, "pulse_internal_token", "") or "").strip()
    if not secret:
        return ""
    digest = hmac.new(secret.encode("utf-8"), timestamp.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest
