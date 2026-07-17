from datetime import UTC, datetime, timedelta
from collections import defaultdict
from threading import Lock

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import AIGeneration, ContentPost, PostStatus, TrendSignalEvent, User
from app.schemas.mvp import AdminOverview, AdminSeriesPoint, AdminTopCreatorItem

router = APIRouter(prefix="/admin", tags=["admin"])

MAX_ADMIN_FAILED_ATTEMPTS = 5
ADMIN_LOCKOUT_MINUTES = 15
_admin_attempts_lock = Lock()
_admin_attempts: dict[str, dict[str, int | str]] = {}


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
        top_creators=top_creators,
        users_created_7d=_daily_series(recent_user_rows, now),
        posts_created_7d=_daily_series(recent_post_rows, now),
        ai_generations_7d=_daily_series(recent_ai_rows, now),
    )
