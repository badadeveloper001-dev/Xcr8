from datetime import UTC, datetime, timedelta
from collections import defaultdict
from threading import Lock

from fastapi import APIRouter, Depends, Header, HTTPException, Request
import httpx
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import AIGeneration, ContentPost, PostStatus, PulseIncident, TrendSignalEvent, User
from app.schemas.mvp import (
    AdminOverview,
    AdminSeriesPoint,
    AdminTopCreatorItem,
    PulseIncidentItem,
    PulseStatusUpdateRequest,
)
from app.services.pulse import resolve_pulse_incident
from app.services.pulse import record_pulse_event

router = APIRouter(prefix="/admin", tags=["admin"])

MAX_ADMIN_FAILED_ATTEMPTS = 5
ADMIN_LOCKOUT_MINUTES = 15
_admin_attempts_lock = Lock()
_admin_attempts: dict[str, dict[str, int | str]] = {}


def _supabase_admin_headers() -> dict[str, str] | None:
    url = str(settings.supabase_url or "").strip()
    key = str(settings.supabase_service_role_key or "").strip()
    if not url or not key:
        return None
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _fetch_supabase_auth_users() -> list[dict]:
    headers = _supabase_admin_headers()
    if not headers:
        return []

    collected: list[dict] = []
    page = 1
    per_page = 200
    base_url = str(settings.supabase_url or "").rstrip("/")

    with httpx.Client(timeout=15.0) as client:
        while page <= 25:
            response = client.get(
                f"{base_url}/auth/v1/admin/users",
                headers=headers,
                params={"page": page, "per_page": per_page},
            )
            if response.status_code >= 400:
                return collected

            payload = response.json()
            users = payload.get("users") if isinstance(payload, dict) else None
            if not isinstance(users, list) or not users:
                break

            collected.extend(user for user in users if isinstance(user, dict))
            if len(users) < per_page:
                break
            page += 1

    return collected


def _parse_supabase_dt(value: object) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    candidate = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _supabase_user_series(auth_users: list[dict], now: datetime) -> tuple[int, int, int, list[AdminSeriesPoint]]:
    auth_total = len(auth_users)
    auth_onboarded = 0
    auth_active_7d = 0
    recent_created_rows: list[datetime] = []
    last_7_days = now - timedelta(days=7)

    for user in auth_users:
        user_metadata = user.get("user_metadata") if isinstance(user.get("user_metadata"), dict) else {}
        app_metadata = user.get("app_metadata") if isinstance(user.get("app_metadata"), dict) else {}

        if bool(user_metadata.get("onboarding_complete")) or bool(app_metadata.get("onboarding_complete")):
            auth_onboarded += 1

        created_at = _parse_supabase_dt(user.get("created_at"))
        if created_at and created_at >= last_7_days:
            recent_created_rows.append(created_at)

        last_seen = _parse_supabase_dt(user.get("last_sign_in_at")) or _parse_supabase_dt(user.get("updated_at"))
        if last_seen and last_seen >= last_7_days:
            auth_active_7d += 1

    return auth_total, auth_onboarded, auth_active_7d, _daily_series(recent_created_rows, now)


def _sync_auth_users_into_app(db: Session, auth_users: list[dict]) -> None:
    if not auth_users:
        return

    existing_users = {
        str(user.email or "").strip().lower(): user
        for user in db.scalars(select(User)).all()
        if str(user.email or "").strip()
    }

    created_or_updated = False

    for auth_user in auth_users:
        email = str(auth_user.get("email") or "").strip().lower()
        if not email:
            continue

        user_metadata = auth_user.get("user_metadata") if isinstance(auth_user.get("user_metadata"), dict) else {}
        app_metadata = auth_user.get("app_metadata") if isinstance(auth_user.get("app_metadata"), dict) else {}
        display_name = str(user_metadata.get("full_name") or user_metadata.get("name") or email.split("@", 1)[0]).strip() or "Creator"
        onboarding_complete = bool(user_metadata.get("onboarding_complete") or app_metadata.get("onboarding_complete"))

        existing = existing_users.get(email)
        if not existing:
            candidate = User(
                email=email,
                display_name=display_name,
                onboarding_complete=onboarding_complete,
            )
            db.add(candidate)
            existing_users[email] = candidate
            created_or_updated = True
            continue

        next_display = str(existing.display_name or "").strip()
        if not next_display or next_display == email.split("@", 1)[0]:
            existing.display_name = display_name
            created_or_updated = True
        if onboarding_complete and not existing.onboarding_complete:
            existing.onboarding_complete = True
            created_or_updated = True
        db.add(existing)

    if created_or_updated:
        db.commit()


def _resolve_client_id(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def _record_failed_attempt(client_id: str) -> None:
    with _admin_attempts_lock:
        entry = _admin_attempts.get(client_id, {"count": 0})
        count = int(entry.get("count", 0)) + 1
        lock_until: str | None = None
        if count >= MAX_ADMIN_FAILED_ATTEMPTS:
            lock_until = (datetime.now(tz=UTC) + timedelta(minutes=ADMIN_LOCKOUT_MINUTES)).isoformat()
            count = 0
        _admin_attempts[client_id] = {"count": count, "lock_until": lock_until or ""}


def _clear_attempts(client_id: str) -> None:
    with _admin_attempts_lock:
        if client_id in _admin_attempts:
            _admin_attempts.pop(client_id, None)


def _ensure_not_locked(client_id: str) -> None:
    with _admin_attempts_lock:
        entry = _admin_attempts.get(client_id)
        if not entry:
            return
        lock_until_raw = str(entry.get("lock_until") or "").strip()
        if not lock_until_raw:
            return
        try:
            lock_until = datetime.fromisoformat(lock_until_raw)
        except ValueError:
            _admin_attempts.pop(client_id, None)
            return
        if lock_until.tzinfo is None:
            lock_until = lock_until.replace(tzinfo=UTC)
        now = datetime.now(tz=UTC)
        if now < lock_until:
            retry_in = max(1, int((lock_until - now).total_seconds() // 60))
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed attempts. Try again in about {retry_in} minute(s).",
            )
        _admin_attempts.pop(client_id, None)


def _require_admin_access(x_admin_code: str | None, request: Request) -> None:
    client_id = _resolve_client_id(request)
    _ensure_not_locked(client_id)

    expected = str(settings.admin_access_code or "XCR800").strip()
    supplied = str(x_admin_code or "").strip()
    if not supplied or supplied != expected:
        _record_failed_attempt(client_id)
        raise HTTPException(status_code=401, detail="Invalid admin access code")
    _clear_attempts(client_id)


def _daily_series(values: list[datetime], now: datetime) -> list[AdminSeriesPoint]:
    buckets: dict[str, int] = defaultdict(int)
    for dt in values:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        buckets[dt.date().isoformat()] += 1

    points: list[AdminSeriesPoint] = []
    for offset in range(6, -1, -1):
        day = (now - timedelta(days=offset)).date().isoformat()
        points.append(AdminSeriesPoint(date=day, value=int(buckets.get(day, 0))))
    return points


@router.get("/overview", response_model=AdminOverview)
def admin_overview(
    request: Request,
    x_admin_code: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AdminOverview:
    _require_admin_access(x_admin_code, request)

    now = datetime.now(tz=UTC)
    last_7_days = now - timedelta(days=7)

    total_users = db.scalar(select(func.count(User.id))) or 0
    onboarded_users = db.scalar(select(func.count(User.id)).where(User.onboarding_complete.is_(True))) or 0
    active_users_7d = (
        db.scalar(select(func.count(User.id)).where(User.updated_at >= last_7_days)) or 0
    )

    total_posts = db.scalar(select(func.count(ContentPost.id))) or 0
    draft_posts = (
        db.scalar(select(func.count(ContentPost.id)).where(ContentPost.status == PostStatus.draft)) or 0
    )
    scheduled_posts = (
        db.scalar(select(func.count(ContentPost.id)).where(ContentPost.status == PostStatus.scheduled)) or 0
    )
    published_posts = (
        db.scalar(select(func.count(ContentPost.id)).where(ContentPost.status == PostStatus.published)) or 0
    )

    ai_generations = db.scalar(select(func.count(AIGeneration.id))) or 0
    trend_signals = db.scalar(select(func.count(TrendSignalEvent.id))) or 0
    pulse_open_incidents = (
        db.scalar(select(func.count(PulseIncident.id)).where(PulseIncident.status != "fixed")) or 0
    )
    pulse_critical_incidents = (
        db.scalar(
            select(func.count(PulseIncident.id)).where(
                PulseIncident.status != "fixed",
                PulseIncident.severity == "critical",
            )
        )
        or 0
    )

    recent_user_rows = list(
        db.scalars(select(User.created_at).where(User.created_at >= last_7_days))
    )
    recent_post_rows = list(
        db.scalars(select(ContentPost.created_at).where(ContentPost.created_at >= last_7_days))
    )
    recent_ai_rows = list(
        db.scalars(select(AIGeneration.created_at).where(AIGeneration.created_at >= last_7_days))
    )

    top_rows = db.execute(
        select(
            User.id,
            User.display_name,
            User.email,
            func.count(ContentPost.id).label("posts"),
            func.sum(case((ContentPost.status == PostStatus.scheduled, 1), else_=0)).label("scheduled"),
            func.sum(case((ContentPost.status == PostStatus.published, 1), else_=0)).label("published"),
            func.sum(case((ContentPost.status == PostStatus.draft, 1), else_=0)).label("drafts"),
        )
        .outerjoin(ContentPost, ContentPost.user_id == User.id)
        .group_by(User.id, User.display_name, User.email)
        .order_by(func.count(ContentPost.id).desc(), User.created_at.asc())
        .limit(8)
    ).all()

    top_creators = [
        AdminTopCreatorItem(
            user_id=int(row.id),
            display_name=str(row.display_name or "Creator"),
            email=str(row.email or ""),
            posts=int(row.posts or 0),
            scheduled=int(row.scheduled or 0),
            published=int(row.published or 0),
            draft_posts=int(row.drafts or 0),
        )
        for row in top_rows
    ]

    auth_users = _fetch_supabase_auth_users()
    _sync_auth_users_into_app(db, auth_users)

    total_users = db.scalar(select(func.count(User.id))) or total_users
    onboarded_users = db.scalar(select(func.count(User.id)).where(User.onboarding_complete.is_(True))) or onboarded_users
    active_users_7d = db.scalar(select(func.count(User.id)).where(User.updated_at >= last_7_days)) or active_users_7d

    auth_total_users, auth_onboarded_users, auth_active_users_7d, auth_user_series = _supabase_user_series(
        auth_users,
        now,
    )

    if auth_total_users > total_users:
        total_users = auth_total_users
    if auth_onboarded_users > onboarded_users:
        onboarded_users = auth_onboarded_users
    if auth_active_users_7d > active_users_7d:
        active_users_7d = auth_active_users_7d

    user_series = auth_user_series if auth_total_users > len(recent_user_rows) else _daily_series(recent_user_rows, now)

    return AdminOverview(
        generated_at=now.isoformat(),
        total_users=total_users,
        onboarded_users=onboarded_users,
        active_users_7d=active_users_7d,
        total_posts=total_posts,
        draft_posts=draft_posts,
        scheduled_posts=scheduled_posts,
        published_posts=published_posts,
        ai_generations=ai_generations,
        trend_signals=trend_signals,
        pulse_open_incidents=pulse_open_incidents,
        pulse_critical_incidents=pulse_critical_incidents,
        top_creators=top_creators,
        users_created_7d=user_series,
        posts_created_7d=_daily_series(recent_post_rows, now),
        ai_generations_7d=_daily_series(recent_ai_rows, now),
    )


@router.get("/incidents", response_model=list[PulseIncidentItem])
def list_admin_incidents(
    request: Request,
    x_admin_code: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[PulseIncidentItem]:
    _require_admin_access(x_admin_code, request)

    incidents = list(
        db.scalars(
            select(PulseIncident)
            .order_by(
                case((PulseIncident.status != "fixed", 0), else_=1),
                case((PulseIncident.severity == "critical", 0), else_=1),
                desc(PulseIncident.last_seen_at),
            )
            .limit(60)
        )
    )

    return [
        PulseIncidentItem(
            id=incident.id,
            title=incident.title,
            feature=incident.feature,
            error_type=incident.error_type,
            severity=incident.severity,
            provider=incident.provider,
            possible_reason=incident.possible_reason,
            status=incident.status,
            affected_users_count=incident.affected_users_count,
            total_events_count=incident.total_events_count,
            first_seen_at=incident.first_seen_at.isoformat() if incident.first_seen_at else "",
            last_seen_at=incident.last_seen_at.isoformat() if incident.last_seen_at else "",
            resolved_at=incident.resolved_at.isoformat() if incident.resolved_at else None,
        )
        for incident in incidents
    ]


@router.patch("/incidents/{incident_id}", response_model=PulseIncidentItem)
def update_admin_incident(
    incident_id: int,
    payload: PulseStatusUpdateRequest,
    request: Request,
    x_admin_code: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> PulseIncidentItem:
    _require_admin_access(x_admin_code, request)

    incident = db.get(PulseIncident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if payload.status == "fixed":
        incident = resolve_pulse_incident(db, incident_id, payload.resolution_summary)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
    else:
        incident.status = payload.status
        if payload.resolution_summary:
            incident.resolution_summary = payload.resolution_summary
        db.add(incident)
        db.commit()
        db.refresh(incident)

    return PulseIncidentItem(
        id=incident.id,
        title=incident.title,
        feature=incident.feature,
        error_type=incident.error_type,
        severity=incident.severity,
        provider=incident.provider,
        possible_reason=incident.possible_reason,
        status=incident.status,
        affected_users_count=incident.affected_users_count,
        total_events_count=incident.total_events_count,
        first_seen_at=incident.first_seen_at.isoformat() if incident.first_seen_at else "",
        last_seen_at=incident.last_seen_at.isoformat() if incident.last_seen_at else "",
        resolved_at=incident.resolved_at.isoformat() if incident.resolved_at else None,
    )


@router.post("/incidents/test", response_model=PulseIncidentItem)
def trigger_test_incident(
    request: Request,
    x_admin_code: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> PulseIncidentItem:
    _require_admin_access(x_admin_code, request)

    event = record_pulse_event(
        db,
        {
            "event_type": "error",
            "feature": "pulse_test",
            "route": "/api/v1/admin/incidents/test",
            "method": "POST",
            "http_status": 503,
            "detail": "Manual Pulse test incident triggered from admin dashboard.",
            "provider": "XCR8",
            "event_meta": {"manual_test": True},
        },
    )
    incident = db.get(PulseIncident, event.incident_id)
    if not incident:
        raise HTTPException(status_code=500, detail="Test incident was not created")

    return PulseIncidentItem(
        id=incident.id,
        title=incident.title,
        feature=incident.feature,
        error_type=incident.error_type,
        severity=incident.severity,
        provider=incident.provider,
        possible_reason=incident.possible_reason,
        status=incident.status,
        affected_users_count=incident.affected_users_count,
        total_events_count=incident.total_events_count,
        first_seen_at=incident.first_seen_at.isoformat() if incident.first_seen_at else "",
        last_seen_at=incident.last_seen_at.isoformat() if incident.last_seen_at else "",
        resolved_at=incident.resolved_at.isoformat() if incident.resolved_at else None,
    )
