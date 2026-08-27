from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from urllib.parse import quote
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import PaymentEvent, PlanTier, UsageLedger, User
from app.schemas.mvp import PaystackVerifyRequest, PlanUpgradeRequest
from app.services.entitlements import PLAN_CONFIG, normalize_plan_id, serialize_plan, usage_snapshot

router = APIRouter(prefix="/plans", tags=["plans"])
PAID_WEBHOOK_STATUSES = {"paid", "succeeded", "active", "completed"}


@router.get("/", response_model=list)
def list_plans(request: Request, response: Response) -> list:
    # Render traffic passes through Cloudflare; keep the former Vercel header as
    # a migration fallback. Payment activation still validates currency/amount.
    country_code = str(
        request.headers.get("cf-ipcountry")
        or request.headers.get("x-country-code")
        or request.headers.get("x-vercel-ip-country")
        or ""
    ).strip().upper()[:2]
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Vary"] = "CF-IPCountry, X-Country-Code, X-Vercel-IP-Country"
    return [
        serialize_plan(PLAN_CONFIG[plan_id], country_code=country_code)
        for plan_id in ("free", "starter", "pro", "business")
    ]


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



def _request_country_code(request: Request) -> str:
    return str(
        request.headers.get("cf-ipcountry")
        or request.headers.get("x-country-code")
        or request.headers.get("x-vercel-ip-country")
        or ""
    ).strip().upper()[:2]


def _paystack_currency(request: Request) -> str:
    configured = str(settings.paystack_currency or "").strip().upper()
    if configured in {"NGN", "USD"}:
        return configured
    return "NGN" if _request_country_code(request) == "NG" else "USD"


def _paystack_amount(plan_id: str, currency: str, billing_cycle: str) -> int:
    plan = PLAN_CONFIG[plan_id]
    if currency == "NGN":
        return plan.ngn_annual_price_kobo if billing_cycle == "annual" else plan.ngn_price_kobo
    return plan.annual_price_cents if billing_cycle == "annual" else plan.price_cents


def _activate_paystack_payment(
    db: Session,
    *,
    event_id: str,
    user_id: int,
    plan_id: str,
    status: str,
    currency: str,
    amount_minor: int,
    billing_cycle: str,
    payload_hash: str,
    provider_meta: dict,
) -> dict:
    normalized_plan = normalize_plan_id(plan_id)
    if normalized_plan not in {"starter", "pro", "business"}:
        raise HTTPException(status_code=400, detail="Paystack metadata contains an invalid Xcr8 plan")
    if status != "success":
        raise HTTPException(status_code=400, detail="Paystack transaction is not successful")
    if currency not in {"USD", "NGN"}:
        raise HTTPException(status_code=400, detail="Paystack currency is invalid")
    if billing_cycle not in {"monthly", "annual"}:
        raise HTTPException(status_code=400, detail="Paystack billing cycle is invalid")

    expected_amount = _paystack_amount(normalized_plan, currency, billing_cycle)
    if int(amount_minor) != expected_amount:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "payment_amount_mismatch",
                "message": "The verified Paystack amount does not match the selected Xcr8 plan.",
                "currency": currency,
                "billing_cycle": billing_cycle,
                "expected_amount_minor": expected_amount,
                "received_amount_minor": int(amount_minor),
            },
        )

    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    previous = db.scalar(
        select(PaymentEvent).where(
            PaymentEvent.provider == "paystack",
            PaymentEvent.provider_event_id == event_id,
        )
    )
    if previous:
        db.rollback()
        return {"processed": False, "duplicate": True, "event_id": event_id, "plan": normalized_plan}

    now = datetime.now(tz=UTC)
    expires_at = now + timedelta(days=365 if billing_cycle == "annual" else 31)
    user.plan_tier = PlanTier(normalized_plan)
    user.plan_started_at = now
    user.plan_expires_at = expires_at
    user.billing_meta = {
        "provider": "paystack",
        "reference": event_id,
        "billing_cycle": billing_cycle,
        "currency": currency,
        "amount_minor": int(amount_minor),
        "last_verified_at": now.isoformat(),
        **{key: value for key, value in provider_meta.items() if value is not None},
    }
    db.add(
        PaymentEvent(
            provider_event_id=event_id,
            provider="paystack",
            user_id=user.id,
            plan=normalized_plan,
            status=status,
            payload_hash=payload_hash,
            signature_verified=True,
        )
    )
    db.add(user)
    db.commit()
    return {"processed": True, "duplicate": False, "user_id": user.id, "plan": normalized_plan, "reference": event_id}


def _verify_paystack_reference(reference: str) -> dict:
    secret = str(settings.paystack_secret_key or "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Paystack is not configured")
    base_url = str(settings.paystack_base_url or "https://api.paystack.co").rstrip("/")
    with httpx.Client(timeout=20.0) as client:
        response = client.get(
            f"{base_url}/transaction/verify/{quote(reference, safe='')}",
            headers={"Authorization": f"Bearer {secret}", "Cache-Control": "no-cache"},
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Paystack verification request failed")
    try:
        payload = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Paystack returned an invalid verification response")
    if not isinstance(payload, dict) or payload.get("status") is not True:
        raise HTTPException(status_code=400, detail="Paystack could not verify this transaction")
    data = payload.get("data")
    if not isinstance(data, dict) or str(data.get("status") or "").lower() != "success":
        raise HTTPException(status_code=400, detail="Paystack transaction has not completed successfully")
    verified_reference = str(data.get("reference") or "").strip()
    if verified_reference != reference:
        raise HTTPException(status_code=400, detail="Paystack reference mismatch")
    return data


def _paystack_metadata(data: dict) -> tuple[int, str, str]:
    metadata = data.get("metadata")
    if not isinstance(metadata, dict):
        raise HTTPException(status_code=400, detail="Paystack transaction metadata is missing")
    try:
        user_id = int(metadata.get("user_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Paystack metadata user_id is invalid")
    plan_id = str(metadata.get("plan") or "").strip().lower()
    billing_cycle = str(metadata.get("billing_cycle") or "monthly").strip().lower()
    return user_id, plan_id, billing_cycle


async def _handle_paystack_webhook(request: Request, db: Session) -> dict:
    secret = str(settings.paystack_secret_key or "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Paystack is not configured")

    raw_body = await request.body()
    supplied = str(request.headers.get("x-paystack-signature") or "").strip()
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid Paystack webhook signature")

    try:
        payload = json.loads(raw_body)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid Paystack webhook JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid Paystack webhook payload")

    event = str(payload.get("event") or "").strip().lower()
    data = payload.get("data")
    if event != "charge.success":
        return {"processed": False, "ignored": True, "event": event or None}
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Paystack webhook data is missing")

    reference = str(data.get("reference") or "").strip()
    if not reference:
        raise HTTPException(status_code=400, detail="Paystack webhook reference is missing")

    verified = _verify_paystack_reference(reference)
    user_id, plan_id, billing_cycle = _paystack_metadata(verified)
    return _activate_paystack_payment(
        db,
        event_id=reference,
        user_id=user_id,
        plan_id=plan_id,
        status=str(verified.get("status") or "").lower(),
        currency=str(verified.get("currency") or "").upper(),
        amount_minor=int(verified.get("amount") or 0),
        billing_cycle=billing_cycle,
        payload_hash=hashlib.sha256(raw_body).hexdigest(),
        provider_meta={
            "transaction_id": verified.get("id"),
            "channel": verified.get("channel"),
            "gateway_response": verified.get("gateway_response"),
            "domain": verified.get("domain"),
        },
    )

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
def create_checkout(
    payload: PlanUpgradeRequest,
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    secret = str(settings.paystack_secret_key or "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Paystack checkout is not configured")
    if settings.paystack_test_mode and not secret.startswith("sk_test_"):
        raise HTTPException(status_code=503, detail="Paystack test mode requires a sk_test_ secret key")

    normalized_plan = normalize_plan_id(payload.plan)
    if normalized_plan not in {"starter", "pro", "business"}:
        raise HTTPException(status_code=400, detail="Choose a paid Xcr8 plan to continue")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    currency = _paystack_currency(request)
    amount_minor = _paystack_amount(normalized_plan, currency, payload.billing_cycle)
    if amount_minor <= 0:
        raise HTTPException(status_code=400, detail="This plan does not require payment")

    reference = f"xcr8_{user_id}_{uuid4().hex}"
    callback_base = str(settings.frontend_url or "").strip().rstrip("/")
    callback_url = f"{callback_base}/settings/billing" if callback_base else None
    metadata = {
        "app": "xcr8",
        "user_id": user.id,
        "plan": normalized_plan,
        "billing_cycle": payload.billing_cycle,
    }
    initialize_payload: dict[str, object] = {
        "email": user.email,
        "amount": str(amount_minor),
        "currency": currency,
        "reference": reference,
        "metadata": metadata,
    }
    if callback_url:
        initialize_payload["callback_url"] = callback_url

    base_url = str(settings.paystack_base_url or "https://api.paystack.co").rstrip("/")
    with httpx.Client(timeout=20.0) as client:
        response = client.post(
            f"{base_url}/transaction/initialize",
            headers={
                "Authorization": f"Bearer {secret}",
                "Content-Type": "application/json",
                "Cache-Control": "no-cache",
            },
            json=initialize_payload,
        )
    if response.status_code >= 400:
        logger_detail = response.text[:300]
        raise HTTPException(status_code=502, detail=f"Paystack checkout initialization failed: {logger_detail}")
    try:
        result = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Paystack returned an invalid checkout response")
    data = result.get("data") if isinstance(result, dict) else None
    if not isinstance(result, dict) or result.get("status") is not True or not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Paystack could not initialize checkout")

    return {
        "provider": "paystack",
        "test_mode": settings.paystack_test_mode,
        "plan": normalized_plan,
        "billing_cycle": payload.billing_cycle,
        "currency": currency,
        "amount_minor": amount_minor,
        "authorization_url": data.get("authorization_url"),
        "access_code": data.get("access_code"),
        "reference": data.get("reference") or reference,
    }


@router.post("/paystack/verify", response_model=dict)
def verify_paystack_payment(
    payload: PaystackVerifyRequest,
    db: Session = Depends(get_db),
) -> dict:
    verified = _verify_paystack_reference(payload.reference)
    user_id, plan_id, billing_cycle = _paystack_metadata(verified)
    if user_id != payload.user_id:
        raise HTTPException(status_code=403, detail="Paystack transaction does not belong to this account")
    result = _activate_paystack_payment(
        db,
        event_id=payload.reference,
        user_id=user_id,
        plan_id=plan_id,
        status=str(verified.get("status") or "").lower(),
        currency=str(verified.get("currency") or "").upper(),
        amount_minor=int(verified.get("amount") or 0),
        billing_cycle=billing_cycle,
        payload_hash=hashlib.sha256(json.dumps(verified, sort_keys=True).encode()).hexdigest(),
        provider_meta={
            "transaction_id": verified.get("id"),
            "channel": verified.get("channel"),
            "gateway_response": verified.get("gateway_response"),
            "domain": verified.get("domain"),
        },
    )
    return {**result, "verified": True}


@router.post("/webhook/{provider}", response_model=dict)
async def payment_webhook(
    provider: str,
    request: Request,
    x_xcr8_signature: str | None = Header(default=None, alias="X-Xcr8-Signature"),
    db: Session = Depends(get_db),
) -> dict:
    if provider.strip().lower() == "paystack":
        return await _handle_paystack_webhook(request, db)

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

    currency = str(payload.get("currency") or "").strip().upper()
    billing_cycle = str(payload.get("billing_cycle") or "monthly").strip().lower()
    if currency not in {"USD", "NGN"}:
        raise HTTPException(status_code=400, detail="Webhook currency must be USD or NGN")
    if billing_cycle not in {"monthly", "annual"}:
        raise HTTPException(status_code=400, detail="Webhook billing_cycle must be monthly or annual")
    try:
        amount_minor = int(payload.get("amount_minor"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Webhook amount_minor must be an integer")

    plan = PLAN_CONFIG[plan_id]
    if currency == "NGN":
        expected_amount_minor = (
            plan.ngn_annual_price_kobo
            if billing_cycle == "annual"
            else plan.ngn_price_kobo
        )
    else:
        expected_amount_minor = (
            plan.annual_price_cents
            if billing_cycle == "annual"
            else plan.price_cents
        )
    if amount_minor != expected_amount_minor:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "payment_amount_mismatch",
                "message": "The verified payment amount does not match the selected Xcr8 plan.",
                "currency": currency,
                "billing_cycle": billing_cycle,
                "expected_amount_minor": expected_amount_minor,
                "received_amount_minor": amount_minor,
            },
        )

    provider_id = provider.strip().lower()[:80] or "unknown"

    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # The user lock serializes webhook processing so duplicate events cannot race
    # into two plan mutations.
    previous = db.scalar(
        select(PaymentEvent).where(
            PaymentEvent.provider == provider_id,
            PaymentEvent.provider_event_id == event_id,
        )
    )
    if previous:
        db.rollback()
        return {"processed": False, "duplicate": True, "event_id": event_id}

    now = datetime.now(tz=UTC)
    expires_at = now + timedelta(days=365 if billing_cycle == "annual" else 31)
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
        "currency": currency,
        "amount_minor": amount_minor,
        "billing_cycle": billing_cycle,
        "last_verified_at": now.isoformat(),
    }
    db.add(
        PaymentEvent(
            provider_event_id=event_id,
            provider=provider_id,
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
