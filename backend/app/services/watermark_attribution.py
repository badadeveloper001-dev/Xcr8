from __future__ import annotations

from secrets import token_urlsafe

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import User, WatermarkLink


ATTRIBUTION_TEXT = "Published with XCR8"


def _new_public_code() -> str:
    return token_urlsafe(9).replace("-", "").replace("_", "")[:12]


def get_or_create_watermark(db: Session, user: User) -> WatermarkLink:
    existing = db.scalar(
        select(WatermarkLink)
        .where(
            WatermarkLink.creator_user_id == user.id,
            WatermarkLink.active == True,  # noqa: E712
        )
        .order_by(WatermarkLink.id.asc())
    )
    if existing:
        return existing

    for _ in range(5):
        public_code = _new_public_code()
        collision = db.scalar(
            select(WatermarkLink.id).where(WatermarkLink.public_code == public_code)
        )
        if collision is not None:
            continue

        watermark = WatermarkLink(
            creator_user_id=user.id,
            public_code=public_code,
            active=True,
        )
        db.add(watermark)
        try:
            db.flush()
        except Exception:
            db.rollback()
            continue
        return watermark

    raise RuntimeError("Unable to create a unique XCR8 watermark code.")


def watermark_url(public_code: str) -> str:
    base = str(settings.frontend_url or "").strip().rstrip("/")
    return f"{base}/c/{public_code}"


def free_attribution(db: Session, user: User) -> dict[str, str] | None:
    from app.services.entitlements import effective_plan_id

    if effective_plan_id(user) != "free":
        return None

    watermark = get_or_create_watermark(db, user)
    return {
        "text": ATTRIBUTION_TEXT,
        "url": watermark_url(watermark.public_code),
        "public_code": watermark.public_code,
    }
