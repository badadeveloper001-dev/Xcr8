from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import ConnectedPlatform, Platform

router = APIRouter(prefix="/platforms", tags=["platforms"])


@router.get("/{user_id}")
def list_platforms(user_id: int, db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(
        select(ConnectedPlatform).where(ConnectedPlatform.user_id == user_id)
    )
    return {
        "platforms": [
            {
                "id": row.id,
                "platform": row.platform.value,
                "handle": row.account_handle,
                "active": row.is_active,
                "sync_status": "synced" if row.is_active else "disconnected",
            }
            for row in rows
        ]
    }


@router.post("/{user_id}/connect")
def connect_platform(user_id: int, platform: str, handle: str, db: Session = Depends(get_db)) -> dict:
    try:
        platform_enum = Platform(platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")

    existing = db.scalar(
        select(ConnectedPlatform).where(
            ConnectedPlatform.user_id == user_id,
            ConnectedPlatform.platform == platform_enum,
        )
    )
    if existing:
        existing.account_handle = handle
        existing.is_active = True
        db.commit()
        return {
            "id": existing.id,
            "platform": existing.platform.value,
            "handle": existing.account_handle,
            "active": existing.is_active,
            "sync_status": "synced",
        }

    row = ConnectedPlatform(
        user_id=user_id,
        platform=platform_enum,
        account_handle=handle,
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "platform": row.platform.value,
        "handle": row.account_handle,
        "active": row.is_active,
        "sync_status": "synced",
    }


@router.delete("/{user_id}/{platform_id}")
def disconnect_platform(user_id: int, platform_id: int, db: Session = Depends(get_db)) -> dict:
    row = db.get(ConnectedPlatform, platform_id)
    if not row or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="Platform connection not found.")
    row.is_active = False
    db.commit()
    return {"disconnected": True, "sync_status": "disconnected"}
