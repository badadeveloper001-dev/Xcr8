from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import ConnectedPlatform, ContentPost, PostStatus, ScheduledPost, User
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
    )
