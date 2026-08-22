from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import PaymentEvent, PlanTier, UsageLedger, User
from app.schemas.mvp import PlanUpgradeRequest
from app.services.entitlements import PLAN_CONFIG, serialize_plan, usage_snapshot

router = APIRouter(prefix="/plans", tags=["plans"])
PAID_WEBHOOK_STATUSES = {"paid", "succeeded", "active", "completed"}


@router.get("/", response_model=list)
def list_plans() -> list:
    return [serialize_plan(PLAN_CONFIG[plan_id]) for plan_id in ("free", "starter", "pro", "business")]


@router.get("/{user_id}/usage", response_model=dict)
def get_usage(user_id: int, db: Session = Depends(get_db)) -> dict:
    return usage_snapshot(db, user_id)


@router.get("/{user_id}/ledger", response_model=list)
def get_usage_ledger(user_id: int, limit: int = 100, db: Session = Depends(get_db)) -> list:
    if not db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    rows = db.scalars(
        select(UsageLedger)
        .where(UsageLedger.user_id == user_id)
        .order_by(UsageLedger.created_at.desc(), UsageLedger.id.desc())
        .limit(max(1, min(limit, 250)))
    ).all()
    return [
        {
            "id": row.id,
            "period": row.period_key,
            "event_type": row.event_type,
            "quantity": row.quantity,
            "credits_delta": row.credits_delta,
            "balance_after": row.balance_after,
            "status": row.status,
            "meta": row.event_meta,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.post("/upgrade", response_model=dict)
def upgrade_plan(payload: PlanUpgradeRequest, user_id: int, db: Session = Depends(get_db)) -> dict:
    # Deliberately never mutate plans here. Only a cryptographically verified payment
    # webhook is allowed to grant paid entitlements.
    _ = payload, user_id, db
    raise HTTPException(
        status_code=403,
        detail={
            "code": "verified_payment_required",
            "message": "Paid plans can only be activated after a verified payment webhook.",
        },
    )


@router.post("/checkout", response_model=dict)
def create_checkout(payload: PlanUpgradeRequest, user_id: int, db: Session = Depends(get_db)) -> dict:
    _ = payload, user_id, db
    raise HTTPException(
        status_code=501,
        detail="Checkout is not configured. Configure a billing provider and its verified webhook first.",
    )


@router.post("/webhook/{provider}", response_model=dict)
async def payment_webhook(
    provider: str,
    request: Request,
    x_xcr8_signature: str | None = Header(default=None, alias="X-Xcr8-Signature"),
    db: Session = Depends(get_db),
) -> dict:
    secret = str(settings.billing_webhook_secret or "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Billing webhook is not configured")

    raw_body = await request.body()
    supplied = str(x_xcr8_signature or "").strip()
    if supplied.lower().startswith("sha256="):
        supplied = supplied.split("=", 1)[1]
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid payment webhook signature")

    try:
        payload = json.loads(raw_body)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid webhook JSON")

    event_id = str(payload.get("event_id") or payload.get("id") or "").strip()
    plan_id = str(payload.get("plan") or "").strip().lower()
    status = str(payload.get("status") or "").strip().lower()
    try:
        user_id = int(payload.get("user_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Webhook user_id must be an integer")

    if not event_id:
        raise HTTPException(status_code=400, detail="Webhook event_id is required")
    if plan_id not in {"starter", "pro", "business"}:
        raise HTTPException(status_code=400, detail="Webhook plan is invalid")
    if status not in PAID_WEBHOOK_STATUSES:
        raise HTTPException(status_code=400, detail="Webhook does not represent a verified paid event")

    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # The user lock serializes webhook processing so duplicate events cannot race
    # into two plan mutations.
    previous = db.scalar(select(PaymentEvent).where(PaymentEvent.provider_event_id == event_id))
    if previous:
        db.rollback()
        return {"processed": False, "duplicate": True, "event_id": event_id}

    now = datetime.now(tz=UTC)
    expires_at = None
    if payload.get("expires_at"):
        try:
            expires_at = datetime.fromisoformat(str(payload["expires_at"]).replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Webhook expires_at must be ISO-8601")

    user.plan_tier = PlanTier(plan_id)
    user.plan_started_at = now
    user.plan_expires_at = expires_at
    user.billing_meta = {
        "provider": provider,
        "customer_id": payload.get("customer_id"),
        "subscription_id": payload.get("subscription_id"),
        "last_event_id": event_id,
        "last_verified_at": now.isoformat(),
    }
    db.add(
        PaymentEvent(
            provider_event_id=event_id,
            provider=provider.strip().lower()[:80] or "unknown",
            user_id=user.id,
            plan=plan_id,
            status=status,
            payload_hash=hashlib.sha256(raw_body).hexdigest(),
            signature_verified=True,
        )
    )
    db.add(user)
    db.commit()
    return {"processed": True, "duplicate": False, "user_id": user.id, "plan": plan_id}
