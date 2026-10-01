from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AcquisitionAttribution,
    GrowthEvent,
    PaymentEvent,
    UsageLedger,
    User,
)


def _window_bounds(days: int) -> tuple[datetime, datetime]:
    bounded = max(1, min(int(days), 3650))
    end = datetime.now(tz=UTC)
    return end - timedelta(days=bounded), end


def _count_events(db: Session, event_type: str, start: datetime, end: datetime) -> int:
    return int(
        db.scalar(
            select(func.count(GrowthEvent.id)).where(
                GrowthEvent.event_type == event_type,
                GrowthEvent.event_time >= start,
                GrowthEvent.event_time < end,
            )
        )
        or 0
    )


def _source_breakdown(db: Session, start: datetime, end: datetime) -> list[dict]:
    rows = db.execute(
        select(
            AcquisitionAttribution.first_touch_type,
            func.count(AcquisitionAttribution.id).label("users"),
            func.count(
                case((AcquisitionAttribution.activation_at.is_not(None), AcquisitionAttribution.id))
            ).label("activated"),
            func.count(
                case((AcquisitionAttribution.first_paid_at.is_not(None), AcquisitionAttribution.id))
            ).label("paid"),
        ).where(
            AcquisitionAttribution.signup_at >= start,
            AcquisitionAttribution.signup_at < end,
        ).group_by(AcquisitionAttribution.first_touch_type)
    ).all()

    attributed_types = {"campaign", "influencer", "user_referral", "watermark"}
    result = [
        {
            "source_type": str(row.first_touch_type or "unknown"),
            "users": int(row.users or 0),
            "activated": int(row.activated or 0),
            "paid": int(row.paid or 0),
        }
        for row in rows
    ]

    organic_users = int(
        db.scalar(
            select(func.count(User.id)).where(
                User.created_at >= start,
                User.created_at < end,
                ~select(AcquisitionAttribution.user_id).where(
                    AcquisitionAttribution.user_id == User.id
                ).exists(),
            )
        )
        or 0
    )
    if organic_users:
        result.append(
            {
                "source_type": "organic",
                "users": organic_users,
                "activated": 0,
                "paid": 0,
            }
        )

    result.sort(key=lambda item: item["users"], reverse=True)
    return result


def _revenue_breakdown(db: Session, start: datetime, end: datetime) -> dict:
    total_minor = int(
        db.scalar(
            select(func.coalesce(func.sum(PaymentEvent.amount_minor), 0)).where(
                PaymentEvent.signature_verified.is_(True),
                PaymentEvent.amount_minor.is_not(None),
                PaymentEvent.processed_at >= start,
                PaymentEvent.processed_at < end,
            )
        )
        or 0
    )

    currency_rows = db.execute(
        select(
            PaymentEvent.currency,
            func.coalesce(func.sum(PaymentEvent.amount_minor), 0).label("amount_minor"),
            func.count(PaymentEvent.id).label("payments"),
        ).where(
            PaymentEvent.signature_verified.is_(True),
            PaymentEvent.amount_minor.is_not(None),
            PaymentEvent.processed_at >= start,
            PaymentEvent.processed_at < end,
        ).group_by(PaymentEvent.currency)
    ).all()

    attributed_rows = db.execute(
        select(
            AcquisitionAttribution.first_touch_type,
            func.coalesce(func.sum(PaymentEvent.amount_minor), 0).label("amount_minor"),
            func.count(PaymentEvent.id).label("payments"),
        )
        .join(PaymentEvent, PaymentEvent.user_id == AcquisitionAttribution.user_id)
        .where(
            PaymentEvent.signature_verified.is_(True),
            PaymentEvent.amount_minor.is_not(None),
            PaymentEvent.processed_at >= start,
            PaymentEvent.processed_at < end,
        )
        .group_by(AcquisitionAttribution.first_touch_type)
    ).all()

    return {
        "total_minor": total_minor,
        "by_currency": [
            {
                "currency": str(row.currency or "UNKNOWN"),
                "amount_minor": int(row.amount_minor or 0),
                "payments": int(row.payments or 0),
            }
            for row in currency_rows
        ],
        "by_first_touch": [
            {
                "source_type": str(row.first_touch_type or "unknown"),
                "amount_minor": int(row.amount_minor or 0),
                "payments": int(row.payments or 0),
            }
            for row in attributed_rows
        ],
        "note": "Amounts are reported in their original minor units; currencies are never converted without an FX source.",
    }


def _cohort_metrics(db: Session, start: datetime, end: datetime) -> dict:
    rows = list(
        db.scalars(
            select(AcquisitionAttribution).where(
                AcquisitionAttribution.signup_at >= start,
                AcquisitionAttribution.signup_at < end,
                AcquisitionAttribution.signup_at.is_not(None),
            )
        )
    )

    now = datetime.now(tz=UTC)
    cohorts: dict[str, dict] = {}
    for days in (7, 30, 90):
        eligible = [
            row for row in rows
            if row.signup_at and now >= row.signup_at + timedelta(days=days)
        ]
        activated = [
            row for row in eligible
            if row.activation_at and row.activation_at <= row.signup_at + timedelta(days=days)
        ]
        paid = [
            row for row in eligible
            if row.first_paid_at and row.first_paid_at <= row.signup_at + timedelta(days=days)
        ]
        cohorts[f"{days}d"] = {
            "eligible_signups": len(eligible),
            "activated": len(activated),
            "paid": len(paid),
            "activation_rate": round(len(activated) / len(eligible), 4) if eligible else None,
            "paid_rate": round(len(paid) / len(eligible), 4) if eligible else None,
        }
    return cohorts


def _free_economics(db: Session, start: datetime, end: datetime) -> dict:
    free_users = int(
        db.scalar(
            select(func.count(User.id)).where(
                User.plan_tier == "free",
                User.created_at >= start,
                User.created_at < end,
            )
        )
        or 0
    )
    free_usage_cost = db.scalar(
        select(func.coalesce(func.sum(UsageLedger.estimated_external_cost), 0)).join(
            User, User.id == UsageLedger.user_id
        ).where(
            User.plan_tier == "free",
            UsageLedger.created_at >= start,
            UsageLedger.created_at < end,
            UsageLedger.estimated_external_cost.is_not(None),
        )
    )
    return {
        "new_free_users": free_users,
        "estimated_external_cost_minor": None,
        "estimated_external_cost": float(free_usage_cost or 0),
        "note": "This is provider-cost telemetry, not a monetary valuation of network value.",
    }


def growth_snapshot(db: Session, days: int = 30) -> dict:
    start, end = _window_bounds(days)

    signups = int(
        db.scalar(
            select(func.count(AcquisitionAttribution.id)).where(
                AcquisitionAttribution.signup_at >= start,
                AcquisitionAttribution.signup_at < end,
            )
        )
        or 0
    )
    attributed_signups = int(
        db.scalar(
            select(func.count(AcquisitionAttribution.id)).where(
                AcquisitionAttribution.signup_at >= start,
                AcquisitionAttribution.signup_at < end,
                AcquisitionAttribution.first_touch_type.is_not(None),
            )
        )
        or 0
    )
    activations = int(
        db.scalar(
            select(func.count(AcquisitionAttribution.id)).where(
                AcquisitionAttribution.activation_at >= start,
                AcquisitionAttribution.activation_at < end,
            )
        )
        or 0
    )
    paid = int(
        db.scalar(
            select(func.count(AcquisitionAttribution.id)).where(
                AcquisitionAttribution.first_paid_at >= start,
                AcquisitionAttribution.first_paid_at < end,
            )
        )
        or 0
    )

    return {
        "window": {
            "days": max(1, min(int(days), 3650)),
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
        "funnel": {
            "referral_clicks": _count_events(db, "referral_link_clicked", start, end),
            "watermark_clicks": _count_events(db, "watermark_link_clicked", start, end),
            "signups": signups,
            "attributed_signups": attributed_signups,
            "organic_signups": max(0, signups - attributed_signups),
            "activations": activations,
            "paid_users": paid,
            "signup_to_activation_rate": round(activations / signups, 4) if signups else None,
            "activation_to_paid_rate": round(paid / activations, 4) if activations else None,
        },
        "lifecycle_events": {
            event_type: _count_events(db, event_type, start, end)
            for event_type in (
                "signup_completed",
                "onboarding_completed",
                "first_generation",
                "first_schedule",
                "first_social_account_connected",
                "subscription_started",
                "subscription_upgraded",
                "subscription_renewed",
                "subscription_cancelled",
            )
        },
        "sources": _source_breakdown(db, start, end),
        "cohorts": _cohort_metrics(db, start, end),
        "revenue": _revenue_breakdown(db, start, end),
        "free_economics": _free_economics(db, start, end),
        "limitations": [
            "Revenue remains in original currency/minor units; no FX conversion is performed.",
            "subscription_cancelled remains zero until the Paystack cancellation webhook is wired to Growth events.",
            "Free Network Value is not inferred from provider cost; this snapshot reports actual free-user acquisition and recorded provider-cost telemetry.",
        ],
    }
