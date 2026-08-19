from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.deps import get_db
from app.db.models import Workspace, WorkspaceMembership, User
from app.schemas import mvp

router = APIRouter(prefix="/workspaces", tags=["workspaces"]) 


@router.post("/", response_model=dict)
def create_workspace(payload: dict, user_id: int, db: Session = Depends(get_db)) -> dict:
    name = str(payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Missing workspace name")

    # simple slug: lower + replace spaces
    slug = name.lower().replace(" ", "-")[:120]
    existing = db.scalar(select(Workspace).where(Workspace.slug == slug))
    if existing:
        # ensure unique by appending suffix
        base = slug
        suffix = 1
        while True:
            candidate = f"{base}-{suffix}"
            if not db.scalar(select(Workspace).where(Workspace.slug == candidate)):
                slug = candidate
                break
            suffix += 1

    ws = Workspace(name=name, slug=slug)
    db.add(ws)
    db.flush()

    # add membership as owner
    membership = WorkspaceMembership(workspace_id=ws.id, user_id=user_id, role="owner", is_owner=True)
    db.add(membership)
    db.commit()

    return {"id": ws.id, "name": ws.name, "slug": ws.slug}


@router.get("/", response_model=list)
def list_workspaces(user_id: int, db: Session = Depends(get_db)) -> list:
    rows = db.execute(
        select(Workspace).join(WorkspaceMembership).where(WorkspaceMembership.user_id == user_id)
    ).scalars()
    return [{"id": r.id, "name": r.name, "slug": r.slug} for r in rows]
