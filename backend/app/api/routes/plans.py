from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import User, PlanTier
from app.schemas.mvp import PlanUpgradeRequest
from app.core.config import settings

router = APIRouter(prefix="/plans", tags=["plans"])


@router.get("/", response_model=list)
def list_plans() -> list:
    # Static list for now; prices and billing handled externally
    return [
        {"id": "free", "name": "Free", "price": 0},
        {"id": "plus", "name": "Plus", "price": 0},
        {"id": "pro", "name": "Pro", "price": 0},
        {"id": "agency", "name": "Agency", "price": 0},
    ]


@router.post("/upgrade", response_model=dict)
def upgrade_plan(payload: PlanUpgradeRequest, user_id: int, db: Session = Depends(get_db)) -> dict:
    plan = payload.plan
    allowed = {p.value for p in PlanTier}
    if plan not in allowed:
        raise HTTPException(status_code=400, detail="Invalid plan")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # For v1: owner-created membership only; billing handled later. Here we just set plan records.
    user.plan_tier = PlanTier(plan)
    user.plan_started_at = datetime.now(tz=timezone.utc)
    user.plan_expires_at = None
    db.add(user)
    db.commit()

    return {"user_id": user.id, "plan": user.plan_tier.value, "started_at": str(user.plan_started_at)}


@router.post("/checkout", response_model=dict)
def create_checkout(payload: PlanUpgradeRequest, user_id: int, db: Session = Depends(get_db)) -> dict:
    # Placeholder: if Stripe is configured, a future implementation will create a Checkout Session.
    if not getattr(settings, "stripe_secret_key", None):
        raise HTTPException(status_code=501, detail="Stripe not configured on server")

    # Try to import stripe at runtime to avoid hard dependency during local dev/tests.
    try:
        import stripe
    except Exception:
        raise HTTPException(status_code=501, detail="Stripe library not available on server")

    stripe.api_key = settings.stripe_secret_key

    # In v1 we will create a checkout session. For now return not-implemented placeholder.
    raise HTTPException(status_code=501, detail="Checkout integration not implemented yet")
