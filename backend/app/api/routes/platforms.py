from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import ConnectedPlatform, Platform

router = APIRouter(prefix="/platforms", tags=["platforms"])


class PlatformConnectRequest(BaseModel):
    platform: str
    handle: str = Field(min_length=2, max_length=120)
    profile_url: str | None = Field(default=None, max_length=500)


def _serialize_connection(row: ConnectedPlatform) -> dict:
    auth_meta = row.auth_meta if isinstance(row.auth_meta, dict) else {}
    return {
        "id": row.id,
        "platform": row.platform.value,
        "handle": row.account_handle,
        "active": row.is_active,
        "sync_status": auth_meta.get("sync_status") or ("synced" if row.is_active else "disconnected"),
        "connection_method": auth_meta.get("connection_method") or "manual",
        "profile_url": auth_meta.get("profile_url"),
    }


@router.get("/{user_id}")
def list_platforms(user_id: int, db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(
        select(ConnectedPlatform).where(ConnectedPlatform.user_id == user_id)
    )
    return {
        "platforms": [_serialize_connection(row) for row in rows]
    }


@router.post("/{user_id}/connect")
def connect_platform(
    user_id: int,
    payload: PlatformConnectRequest,
    db: Session = Depends(get_db),
) -> dict:
    platform = payload.platform.strip().lower()
    handle = payload.handle.strip()
    profile_url = str(payload.profile_url or "").strip() or None

    try:
        platform_enum = Platform(platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")

    if profile_url and not (profile_url.startswith("https://") or profile_url.startswith("http://")):
        raise HTTPException(status_code=400, detail="Profile URL must start with http:// or https://")

    auth_meta = {
        "connection_method": "manual",
        "profile_url": profile_url,
        "sync_status": "synced",
        "linked_at": datetime.now(tz=UTC).isoformat(),
    }

    existing = db.scalar(
        select(ConnectedPlatform).where(
            ConnectedPlatform.user_id == user_id,
            ConnectedPlatform.platform == platform_enum,
        )
    )
    if existing:
        existing.account_handle = handle
        existing.is_active = True
        existing.auth_meta = {
            **(existing.auth_meta or {}),
            **auth_meta,
        }
        db.commit()
        db.refresh(existing)
        return _serialize_connection(existing)

    row = ConnectedPlatform(
        user_id=user_id,
        platform=platform_enum,
        account_handle=handle,
        is_active=True,
        auth_meta=auth_meta,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_connection(row)


@router.delete("/{user_id}/{platform_id}")
def disconnect_platform(user_id: int, platform_id: int, db: Session = Depends(get_db)) -> dict:
    row = db.get(ConnectedPlatform, platform_id)
    if not row or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="Platform connection not found.")
    row.is_active = False
    row.auth_meta = {
        **(row.auth_meta or {}),
        "sync_status": "disconnected",
        "disconnected_at": datetime.now(tz=UTC).isoformat(),
    }
    db.commit()
    return {"disconnected": True, "sync_status": "disconnected"}
