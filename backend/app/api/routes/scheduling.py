from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import ContentPost, Platform, PostStatus, ScheduledPost
from app.schemas.mvp import ScheduleRequest
from app.workers.tasks import process_distribution_job

router = APIRouter(prefix="/scheduling", tags=["scheduling"])


@router.post("/queue")
def queue_schedule(payload: ScheduleRequest, db: Session = Depends(get_db)) -> dict:
    post = db.get(ContentPost, payload.post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    schedule = ScheduledPost(
        user_id=payload.user_id,
        post_id=payload.post_id,
        platform=Platform(payload.platform),
        scheduled_for=payload.scheduled_for,
        timezone=payload.timezone,
        recurring_rule=payload.recurring_rule,
        queue_status="queued",
    )
    db.add(schedule)
    post.status = PostStatus.scheduled
    db.commit()
    db.refresh(schedule)

    process_distribution_job.delay(
        str(post.id),
        [payload.platform],
    )

    return {
        "schedule_id": schedule.id,
        "post_id": post.id,
        "queue_status": schedule.queue_status,
        "scheduled_for": schedule.scheduled_for.isoformat(),
    }


@router.get("/calendar/{user_id}")
def calendar(user_id: int, db: Session = Depends(get_db)) -> dict:
    schedules = db.scalars(
        select(ScheduledPost)
        .where(ScheduledPost.user_id == user_id)
        .order_by(ScheduledPost.scheduled_for.asc())
        .limit(50)
    )

    return {
        "items": [
            {
                "schedule_id": item.id,
                "platform": item.platform.value,
                "post_id": item.post_id,
                "scheduled_for": item.scheduled_for.isoformat(),
                "timezone": item.timezone,
                "status": item.queue_status,
            }
            for item in schedules
        ]
    }
