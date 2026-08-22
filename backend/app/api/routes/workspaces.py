from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import User, Workspace, WorkspaceMembership
from app.services.entitlements import plan_for_user

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _workspace_payload(workspace: Workspace) -> dict:
    return {
        "id": workspace.id,
        "name": workspace.name,
        "slug": workspace.slug,
        "description": workspace.description,
    }


def _owned_workspace(db: Session, user_id: int, workspace_id: int) -> Workspace:
    workspace = db.scalar(
        select(Workspace)
        .join(WorkspaceMembership)
        .where(
            Workspace.id == workspace_id,
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.is_owner.is_(True),
        )
    )
    if not workspace:
        raise HTTPException(status_code=404, detail="Creator profile not found")
    return workspace


def _unique_slug(db: Session, name: str, workspace_id: int | None = None) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:100] or "creator-profile"
    candidate = base
    suffix = 1
    while db.scalar(
        select(Workspace.id).where(
            Workspace.slug == candidate,
            *([Workspace.id != workspace_id] if workspace_id is not None else []),
        )
    ):
        suffix += 1
        candidate = f"{base[:110]}-{suffix}"
    return candidate[:120]


@router.post("/", response_model=dict)
def create_workspace(payload: dict, user_id: int, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    name = str(payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Creator profile name is required")

    plan = plan_for_user(user)
    owned_count = int(
        db.scalar(
            select(func.count(WorkspaceMembership.id)).where(
                WorkspaceMembership.user_id == user.id,
                WorkspaceMembership.is_owner.is_(True),
            )
        )
        or 0
    )
    if owned_count >= plan.creator_profiles:
        db.rollback()
        raise HTTPException(
            status_code=429,
            detail={
                "code": "plan_quota_exceeded",
                "resource": "creator_profiles",
                "plan": plan.id,
                "limit": plan.creator_profiles,
                "message": f"Your {plan.name} plan supports {plan.creator_profiles} creator profile(s).",
            },
        )

    workspace = Workspace(
        name=name[:180],
        slug=_unique_slug(db, name),
        description=str(payload.get("description") or "").strip()[:2000] or None,
    )
    db.add(workspace)
    db.flush()
    db.add(
        WorkspaceMembership(
            workspace_id=workspace.id,
            user_id=user.id,
            role="owner",
            is_owner=True,
        )
    )
    db.commit()
    db.refresh(workspace)
    return {
        **_workspace_payload(workspace),
        "plan": plan.id,
        "limit": plan.creator_profiles,
        "remaining": max(0, plan.creator_profiles - owned_count - 1),
    }


@router.get("/", response_model=list)
def list_workspaces(user_id: int, db: Session = Depends(get_db)) -> list:
    rows = list(
        db.scalars(
            select(Workspace)
            .join(WorkspaceMembership)
            .where(WorkspaceMembership.user_id == user_id)
            .order_by(Workspace.created_at, Workspace.id)
        )
    )
    return [_workspace_payload(row) for row in rows]


@router.get("/summary", response_model=dict)
def workspace_summary(user_id: int, db: Session = Depends(get_db)) -> dict:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    plan = plan_for_user(user)
    items = list_workspaces(user_id, db)
    return {
        "items": items,
        "count": len(items),
        "limit": plan.creator_profiles,
        "remaining": max(0, plan.creator_profiles - len(items)),
        "plan": plan.id,
    }


@router.patch("/{workspace_id}", response_model=dict)
def update_workspace(
    workspace_id: int,
    payload: dict,
    user_id: int,
    db: Session = Depends(get_db),
) -> dict:
    workspace = _owned_workspace(db, user_id, workspace_id)
    if "name" in payload:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Creator profile name is required")
        workspace.name = name[:180]
        workspace.slug = _unique_slug(db, name, workspace.id)
    if "description" in payload:
        workspace.description = str(payload.get("description") or "").strip()[:2000] or None
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return _workspace_payload(workspace)


@router.delete("/{workspace_id}", response_model=dict)
def delete_workspace(workspace_id: int, user_id: int, db: Session = Depends(get_db)) -> dict:
    workspace = _owned_workspace(db, user_id, workspace_id)
    memberships = list(
        db.scalars(select(WorkspaceMembership).where(WorkspaceMembership.workspace_id == workspace.id))
    )
    for membership in memberships:
        db.delete(membership)
    db.delete(workspace)
    db.commit()
    return {"deleted": True, "workspace_id": workspace_id}
