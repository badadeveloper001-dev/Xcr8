from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import (
    ConnectedPlatform,
    PlanTier,
    UsageAccount,
    UsageLedger,
    UsagePeriod,
    User,
)

UsageMetric = Literal[
    "text_generation",
    "image_generation",
    "high_quality_image",
    "voiceover",
    "scheduled_post",
]

MEBIBYTE = 1024 * 1024
GIBIBYTE = 1024 * MEBIBYTE


@dataclass(frozen=True, slots=True)
class PlanConfig:
    id: str
    name: str
    price_cents: int | None
    monthly_credits: int
    text_generations: int
    image_generations: int
    high_quality_images: int
    voiceovers: int
    social_accounts: int
    scheduled_posts: int
    storage_bytes: int

    @property
    def high_quality_allowed(self) -> bool:
        return self.high_quality_images > 0


PLAN_CONFIG: dict[str, PlanConfig] = {
    "free": PlanConfig(
        id="free",
        name="Free",
        price_cents=0,
        monthly_credits=500,
        text_generations=50,
        image_generations=0,
        high_quality_images=0,
        voiceovers=0,
        social_accounts=1,
        scheduled_posts=10,
        storage_bytes=200 * MEBIBYTE,
    ),
    "starter": PlanConfig(
        id="starter",
        name="Starter",
        price_cents=None,
        monthly_credits=5_000,
        text_generations=500,
        image_generations=25,
        high_quality_images=0,
        voiceovers=10,
        social_accounts=3,
        scheduled_posts=100,
        storage_bytes=2 * GIBIBYTE,
    ),
    "pro": PlanConfig(
        id="pro",
        name="Pro",
        price_cents=None,
        monthly_credits=15_000,
        text_generations=2_500,
        image_generations=100,
        high_quality_images=10,
        voiceovers=50,
        social_accounts=7,
        scheduled_posts=500,
        storage_bytes=10 * GIBIBYTE,
    ),
    "business": PlanConfig(
        id="business",
        name="Business",
        price_cents=None,
        monthly_credits=50_000,
        text_generations=10_000,
        image_generations=300,
        high_quality_images=300,
        voiceovers=200,
        social_accounts=20,
        scheduled_posts=2_000,
        storage_bytes=50 * GIBIBYTE,
    ),
}

# Central credit prices. Quotas remain hard caps even when credits are available.
CREDIT_COSTS: dict[UsageMetric, int] = {
    "text_generation": 5,
    "image_generation": 100,
    "high_quality_image": 250,
    "voiceover": 50,
    "scheduled_post": 0,
}

LEGACY_PLAN_ALIASES = {
    "plus": "starter",
    "agency": "business",
}

_COUNTER_FIELDS: dict[UsageMetric, str] = {
    "text_generation": "text_generations",
    "image_generation": "image_generations",
    "high_quality_image": "high_quality_images",
    "voiceover": "voiceovers",
    "scheduled_post": "scheduled_posts",
}


def normalize_plan_id(value: object) -> str:
    raw = str(getattr(value, "value", value) or "free").strip().lower()
    normalized = LEGACY_PLAN_ALIASES.get(raw, raw)
    return normalized if normalized in PLAN_CONFIG else "free"


def effective_plan_id(user: User, now: datetime | None = None) -> str:
    current = now or datetime.now(tz=UTC)
    expires_at = user.plan_expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= current:
            return "free"
    return normalize_plan_id(user.plan_tier)


def plan_for_user(user: User) -> PlanConfig:
    return PLAN_CONFIG[effective_plan_id(user)]


def serialize_plan(plan: PlanConfig) -> dict:
    payload = asdict(plan)
    payload["high_quality_allowed"] = plan.high_quality_allowed
    payload["storage_megabytes"] = plan.storage_bytes // MEBIBYTE
    payload["credit_costs"] = dict(CREDIT_COSTS)
    return payload


def _period_key(now: datetime | None = None) -> str:
    current = now or datetime.now(tz=UTC)
    return current.strftime("%Y-%m")


def _lock_user(db: Session, user_id: int) -> User:
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _usage_period(db: Session, user: User) -> UsagePeriod:
    key = _period_key()
    period = db.scalar(
        select(UsagePeriod)
        .where(UsagePeriod.user_id == user.id, UsagePeriod.period_key == key)
        .with_for_update()
    )
    if period:
        return period

    period = UsagePeriod(
        user_id=user.id,
        period_key=key,
        credits_granted=plan_for_user(user).monthly_credits,
    )
    db.add(period)
    db.flush()
    return period


def _quota_error(plan: PlanConfig, resource: str, limit: int) -> HTTPException:
    return HTTPException(
        status_code=429,
        detail={
            "code": "plan_quota_exceeded",
            "resource": resource,
            "plan": plan.id,
            "limit": limit,
            "message": f"Your {plan.name} plan has reached its monthly {resource.replace('_', ' ')} limit.",
        },
    )


def _feature_error(plan: PlanConfig, resource: str) -> HTTPException:
    return HTTPException(
        status_code=403,
        detail={
            "code": "feature_not_in_plan",
            "resource": resource,
            "plan": plan.id,
            "message": f"{resource.replace('_', ' ').title()} is not included in the {plan.name} plan.",
        },
    )


def require_feature(db: Session, user_id: int, feature: Literal["image_generation", "voiceover"]) -> PlanConfig:
    user = _lock_user(db, user_id)
    plan = plan_for_user(user)
    limit = plan.image_generations if feature == "image_generation" else plan.voiceovers
    if limit <= 0:
        db.rollback()
        raise _feature_error(plan, feature)
    db.rollback()
    return plan


def consume_usage(
    db: Session,
    user_id: int,
    metric: UsageMetric,
    *,
    quantity: int = 1,
    idempotency_key: str | None = None,
    event_meta: dict | None = None,
) -> UsageLedger:
    if quantity <= 0:
        raise ValueError("Usage quantity must be positive.")

    clean_key = str(idempotency_key or "").strip() or None
    if clean_key:
        existing = db.scalar(select(UsageLedger).where(UsageLedger.idempotency_key == clean_key))
        if existing:
            return existing

    user = _lock_user(db, user_id)
    plan = plan_for_user(user)
    period = _usage_period(db, user)

    # A paid plan can change during a month. Never reduce its already granted credits,
    # but immediately grant the higher plan allowance after a verified upgrade.
    if period.credits_granted < plan.monthly_credits:
        period.credits_granted = plan.monthly_credits

    if metric in {"image_generation", "high_quality_image"} and plan.image_generations <= 0:
        db.rollback()
        raise _feature_error(plan, "image_generation")
    if metric == "voiceover" and plan.voiceovers <= 0:
        db.rollback()
        raise _feature_error(plan, "voiceover")
    if metric == "high_quality_image" and plan.high_quality_images <= 0:
        db.rollback()
        raise _feature_error(plan, "high_quality_image")

    counter_field = _COUNTER_FIELDS[metric]
    current_count = int(getattr(period, counter_field) or 0)
    limit = int(getattr(plan, counter_field))
    if current_count + quantity > limit:
        db.rollback()
        raise _quota_error(plan, counter_field, limit)

    # High-quality images count against both the total image quota and the high-quality sub-quota.
    if metric == "high_quality_image":
        if period.image_generations + quantity > plan.image_generations:
            db.rollback()
            raise _quota_error(plan, "image_generations", plan.image_generations)

    credit_cost = CREDIT_COSTS[metric] * quantity
    remaining = period.credits_granted - period.credits_used
    if credit_cost > remaining:
        db.rollback()
        raise HTTPException(
            status_code=429,
            detail={
                "code": "monthly_credits_exhausted",
                "plan": plan.id,
                "required": credit_cost,
                "remaining": remaining,
                "message": "Monthly credits exhausted. Upgrade or wait for the next billing period.",
            },
        )

    setattr(period, counter_field, current_count + quantity)
    if metric == "high_quality_image":
        period.image_generations += quantity
    period.credits_used += credit_cost

    ledger = UsageLedger(
        user_id=user.id,
        period_key=period.period_key,
        event_type=metric,
        quantity=quantity,
        credits_delta=credit_cost,
        balance_after=period.credits_granted - period.credits_used,
        idempotency_key=clean_key,
        status="consumed",
        event_meta=event_meta or {},
    )
    db.add(period)
    db.add(ledger)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if clean_key:
            existing = db.scalar(select(UsageLedger).where(UsageLedger.idempotency_key == clean_key))
            if existing:
                return existing
        raise
    db.refresh(ledger)
    return ledger


def ensure_social_account_capacity(db: Session, user_id: int, platform: str) -> PlanConfig:
    user = _lock_user(db, user_id)
    plan = plan_for_user(user)
    normalized_platform = str(platform or "").strip().lower()

    existing = db.scalar(
        select(ConnectedPlatform).where(
            ConnectedPlatform.user_id == user.id,
            func.lower(ConnectedPlatform.platform.cast(str)) == normalized_platform,
        )
    )
    if existing and existing.is_active:
        db.rollback()
        return plan

    active_count = int(
        db.scalar(
            select(func.count(ConnectedPlatform.id)).where(
                ConnectedPlatform.user_id == user.id,
                ConnectedPlatform.is_active.is_(True),
            )
        )
        or 0
    )
    if active_count >= plan.social_accounts:
        db.rollback()
        raise _quota_error(plan, "social_accounts", plan.social_accounts)
    db.rollback()
    return plan


def reserve_storage(
    db: Session,
    user_id: int,
    size_bytes: int,
    *,
    idempotency_key: str | None = None,
    event_meta: dict | None = None,
) -> UsageLedger:
    if size_bytes <= 0:
        raise HTTPException(status_code=400, detail="A positive file size is required.")

    clean_key = str(idempotency_key or "").strip() or None
    if clean_key:
        existing = db.scalar(select(UsageLedger).where(UsageLedger.idempotency_key == clean_key))
        if existing:
            return existing

    user = _lock_user(db, user_id)
    plan = plan_for_user(user)
    account = db.scalar(select(UsageAccount).where(UsageAccount.user_id == user.id).with_for_update())
    if not account:
        account = UsageAccount(user_id=user.id, storage_bytes=0)
        db.add(account)
        db.flush()

    if account.storage_bytes + size_bytes > plan.storage_bytes:
        remaining = max(0, plan.storage_bytes - account.storage_bytes)
        db.rollback()
        raise HTTPException(
            status_code=429,
            detail={
                "code": "storage_quota_exceeded",
                "plan": plan.id,
                "limit_bytes": plan.storage_bytes,
                "remaining_bytes": remaining,
                "requested_bytes": size_bytes,
                "message": "This upload would exceed your plan storage limit.",
            },
        )

    account.storage_bytes += size_bytes
    ledger = UsageLedger(
        user_id=user.id,
        period_key=_period_key(),
        event_type="storage_reservation",
        quantity=size_bytes,
        credits_delta=0,
        balance_after=None,
        idempotency_key=clean_key,
        status="reserved",
        event_meta=event_meta or {},
    )
    db.add(account)
    db.add(ledger)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if clean_key:
            existing = db.scalar(select(UsageLedger).where(UsageLedger.idempotency_key == clean_key))
            if existing:
                return existing
        raise
    db.refresh(ledger)
    return ledger


def usage_snapshot(db: Session, user_id: int) -> dict:
    user = _lock_user(db, user_id)
    plan = plan_for_user(user)
    period = _usage_period(db, user)
    account = db.scalar(select(UsageAccount).where(UsageAccount.user_id == user.id))
    payload = {
        "user_id": user.id,
        "plan": serialize_plan(plan),
        "period": period.period_key,
        "credits": {
            "granted": max(period.credits_granted, plan.monthly_credits),
            "used": period.credits_used,
            "remaining": max(0, max(period.credits_granted, plan.monthly_credits) - period.credits_used),
        },
        "usage": {
            "text_generations": period.text_generations,
            "image_generations": period.image_generations,
            "high_quality_images": period.high_quality_images,
            "voiceovers": period.voiceovers,
            "scheduled_posts": period.scheduled_posts,
            "social_accounts": int(
                db.scalar(
                    select(func.count(ConnectedPlatform.id)).where(
                        ConnectedPlatform.user_id == user.id,
                        ConnectedPlatform.is_active.is_(True),
                    )
                )
                or 0
            ),
            "storage_bytes": int(account.storage_bytes if account else 0),
        },
    }
    db.rollback()
    return payload
