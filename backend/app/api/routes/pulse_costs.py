"""Admin-only cost cockpit; extend the existing Pulse/admin access boundary."""
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError

from app.api.routes.admin import _require_admin_access
from app.usage import ledger

router = APIRouter(tags=["pulse"])


@router.get("/admin/pulse-costs")
def costs(request: Request, x_admin_code: str | None = Header(default=None)):
    _require_admin_access(x_admin_code, request)
    try:
        return ledger.dashboard()
    except (SQLAlchemyError, ledger.UsageBlocked) as exc:
        raise HTTPException(503, "Usage dashboard unavailable. Check the migration and database connection.") from exc


class PolicyUpdate(BaseModel):
    revision: int = Field(ge=0)
    config: dict


@router.patch("/admin/pulse-costs")
def save_policy(payload: PolicyUpdate, request: Request, x_admin_code: str | None = Header(default=None)):
    _require_admin_access(x_admin_code, request)
    try:
        config = ledger.validate_config(payload.config)
    except (ValueError, TypeError, ArithmeticError) as exc:
        raise HTTPException(422, str(exc)) from exc
    try:
        with ledger.engine().begin() as conn:
            changed = conn.execute(update(ledger.policy).where(ledger.policy.c.id == 1,
                ledger.policy.c.revision == payload.revision).values(config=config, revision=payload.revision + 1))
            if changed.rowcount != 1:
                raise HTTPException(409, "Policy changed. Refresh the cockpit before saving again.")
        return {"saved": True, "revision": payload.revision + 1}
    except SQLAlchemyError as exc:
        raise HTTPException(503, "Could not save policy. Please try again later.") from exc


class ValueEvent(BaseModel):
    request_id: str = Field(min_length=32, max_length=32, pattern=r"^[a-f0-9]+$")


@router.post("/pulse/value-event")
def downloaded(payload: ValueEvent):
    if not ledger.enabled():
        return {"recorded": False}
    ctx = ledger.context.get() or {}
    if not ctx.get("user_id"):
        raise HTTPException(401, "Please sign in again.")
    try:
        with ledger.engine().begin() as conn:
            row = conn.execute(select(ledger.requests).where(ledger.requests.c.id == payload.request_id,
                ledger.requests.c.user_id == ctx["user_id"], ledger.requests.c.status == "success")).mappings().first()
            if not row:
                raise HTTPException(404, "Generation not found.")
            ledger.put_event(conn, f"downloaded:{payload.request_id}", ctx["user_id"], row["feature"],
                             "downloaded", payload.request_id, "client_reported")
        return {"recorded": True}
    except SQLAlchemyError as exc:
        raise HTTPException(503, "Usage tracking temporarily unavailable.") from exc
