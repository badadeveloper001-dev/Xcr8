from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import AIGeneration, ConnectedPlatform, ContentPost, PostStatus, ScheduledPost, User
from app.schemas.mvp import DashboardOverview, PlatformConnection

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview/{user_id}", response_model=DashboardOverview)
def overview(user_id: int, db: Session = Depends(get_db)) -> DashboardOverview:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    drafts = db.scalar(
        select(func.count(ContentPost.id)).where(
            ContentPost.user_id == user_id, ContentPost.status == PostStatus.draft
        )
    )
    scheduled = db.scalar(
        select(func.count(ScheduledPost.id)).where(
            ScheduledPost.user_id == user_id,
            ScheduledPost.scheduled_for >= datetime.utcnow(),
        )
    )

    recent_posts_query = db.scalars(
        select(ContentPost)
        .where(ContentPost.user_id == user_id)
        .order_by(ContentPost.created_at.desc())
        .limit(5)
    )
    recent_posts = [
        {
            "post_id": post.id,
            "title": post.title,
            "status": post.status.value,
            "created_at": post.created_at.isoformat(),
            "media_url": post.media_url,
        }
        for post in recent_posts_query
    ]

    platforms = db.scalars(
        select(ConnectedPlatform).where(ConnectedPlatform.user_id == user_id).limit(8)
    )

    ai_rows = list(
        db.scalars(
            select(AIGeneration)
            .join(ContentPost, AIGeneration.post_id == ContentPost.id)
            .where(ContentPost.user_id == user_id)
            .order_by(AIGeneration.created_at.desc())
            .limit(200)
        )
    )
    total_generations = len(ai_rows)
    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_latency_ms = 0
    latency_count = 0
    template_versions: dict[str, int] = {}

    for row in ai_rows:
        payload = row.output_payload or {}
        usage = payload.get("usage") if isinstance(payload, dict) else {}
        if not isinstance(usage, dict):
            usage = {}

        total_prompt_tokens += int(usage.get("prompt_tokens") or 0)
        total_completion_tokens += int(usage.get("completion_tokens") or 0)

        latency_ms = payload.get("latency_ms") if isinstance(payload, dict) else None
        if isinstance(latency_ms, int) and latency_ms >= 0:
            total_latency_ms += latency_ms
            latency_count += 1

        template = payload.get("prompt_template_version") if isinstance(payload, dict) else None
        if isinstance(template, str) and template:
            template_versions[template] = template_versions.get(template, 0) + 1

    average_latency_ms = int(total_latency_ms / latency_count) if latency_count else 0
    most_used_template = (
        max(template_versions.items(), key=lambda item: item[1])[0] if template_versions else "unknown"
    )

    return DashboardOverview(
        greeting="Good evening" if datetime.utcnow().hour >= 12 else "Good morning",
        creator_name=user.display_name,
        platforms_connected=sum(1 for _ in platforms),
        drafts=drafts or 0,
        scheduled=scheduled or 0,
        ai_suggestions=6,
        recent_posts=recent_posts,
        ai_insights=[
            {
                "title": "Best Posting Time",
                "description": "Your audience is most active at 8PM (Wednesdays and Fridays)",
            },
            {
                "title": "Caption Style",
                "description": "Funny hooks perform 43% better for your account",
            },
        ],
        connected_platforms=[
            PlatformConnection(
                platform=platform.platform.value,
                account_handle=platform.account_handle,
                is_active=platform.is_active,
            )
            for platform in db.scalars(
                select(ConnectedPlatform).where(ConnectedPlatform.user_id == user_id).limit(8)
            )
        ],
        ai_ops={
            "total_generations": total_generations,
            "total_prompt_tokens": total_prompt_tokens,
            "total_completion_tokens": total_completion_tokens,
            "average_latency_ms": average_latency_ms,
            "most_used_template": most_used_template,
        },
    )
