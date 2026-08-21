from __future__ import annotations

import hmac
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.routes.social_publish import PublishPostRequest, publish_post
from app.core.config import settings
from app.db.deps import get_db
from app.db.models import ContentPost, Platform, PostStatus, ScheduledPost
from app.schemas.mvp import ScheduleRequest

router = APIRouter(prefix="/scheduling", tags=["scheduling"])

_DISPATCH_BATCH_SIZE = 20
_STALE_PROCESSING_AFTER = timedelta(minutes=10)


@router.post("/queue")
def queue_schedule(payload: ScheduleRequest, db: Session = Depends(get_db)) -> dict:
    post = db.get(ContentPost, payload.post_id)
    if not post or post.user_id != payload.user_id:
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

    return {
        "schedule_id": schedule.id,
        "post_id": post.id,
        "queue_status": schedule.queue_status,
        "scheduled_for": schedule.scheduled_for.isoformat(),
    }


def _authorize_cron(authorization: str | None) -> None:
    secret = str(settings.cron_secret or "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Scheduling is not configured. Set CRON_SECRET.")
    expected = f"Bearer {secret}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized scheduled-dispatch request.")


@router.get("/dispatch-due")
def dispatch_due_posts(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Secure, idempotent Vercel Cron target that publishes every due schedule once."""
    _authorize_cron(authorization)
    now = datetime.now(tz=UTC)
    stale_before = now - _STALE_PROCESSING_AFTER

    due_schedules = list(
        db.scalars(
            select(ScheduledPost)
            .where(
                ScheduledPost.scheduled_for <= now,
                or_(
                    ScheduledPost.queue_status == "queued",
                    (
                        (ScheduledPost.queue_status == "processing")
                        & (ScheduledPost.scheduled_for <= stale_before)
                    ),
                ),
            )
            .order_by(ScheduledPost.scheduled_for.asc())
            .limit(_DISPATCH_BATCH_SIZE)
            .with_for_update(skip_locked=True)
        )
    )

    processed: list[dict] = []
    for schedule in due_schedules:
        schedule.queue_status = "processing"
        db.commit()

        try:
            result = publish_post(
                PublishPostRequest(
                    user_id=schedule.user_id,
                    post_id=schedule.post_id,
                    platforms=[schedule.platform.value],
                ),
                db,
            )
            published = bool(result.get("published"))
            schedule.queue_status = "published" if published else "failed"

            post = db.get(ContentPost, schedule.post_id)
            if published and post:
                post.status = PostStatus.published

            db.commit()
            processed.append(
                {
                    "schedule_id": schedule.id,
                    "post_id": schedule.post_id,
                    "platform": schedule.platform.value,
                    "status": schedule.queue_status,
                    "results": result.get("results", {}),
                }
            )
        except HTTPException as exc:
            db.rollback()
            schedule = db.get(ScheduledPost, schedule.id)
            if schedule:
                schedule.queue_status = "failed"
                post = db.get(ContentPost, schedule.post_id)
                if post:
                    meta = dict(post.content_meta or {})
                    meta["last_schedule_failure"] = {"schedule_id": schedule.id, "platform": schedule.platform.value, "reason": str(exc.detail)[:300], "occurred_at": datetime.now(tz=UTC).isoformat()}
                    post.content_meta = meta
                    db.add(post)
                db.commit()
            processed.append(
                {
                    "schedule_id": schedule.id if schedule else None,
                    "post_id": schedule.post_id if schedule else None,
                    "status": "failed",
                    "error": str(exc.detail),
                }
            )
        except Exception as exc:
            db.rollback()
            schedule = db.get(ScheduledPost, schedule.id)
            if schedule:
                schedule.queue_status = "failed"
                post = db.get(ContentPost, schedule.post_id)
                if post:
                    meta = dict(post.content_meta or {})
                    meta["last_schedule_failure"] = {"schedule_id": schedule.id, "platform": schedule.platform.value, "reason": str(exc)[:300], "occurred_at": datetime.now(tz=UTC).isoformat()}
                    post.content_meta = meta
                    db.add(post)
                db.commit()
            processed.append(
                {
                    "schedule_id": schedule.id if schedule else None,
                    "post_id": schedule.post_id if schedule else None,
                    "status": "failed",
                    "error": str(exc)[:300],
                }
            )

    return {
        "processed_at": now.isoformat(),
        "processed_count": len(processed),
        "items": processed,
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
