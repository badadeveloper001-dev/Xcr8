from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import AIGeneration, ContentPost, PostStatus, TrendSignalEvent, User
from app.schemas.mvp import AdminOverview, AdminTopCreatorItem

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin_access(x_admin_code: str | None) -> None:
    expected = str(settings.admin_access_code or "XCR800").strip()
    supplied = str(x_admin_code or "").strip()
    if not supplied or supplied != expected:
        raise HTTPException(status_code=401, detail="Invalid admin access code")


@router.get("/overview", response_model=AdminOverview)
def admin_overview(
    x_admin_code: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AdminOverview:
    _require_admin_access(x_admin_code)

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
    )
