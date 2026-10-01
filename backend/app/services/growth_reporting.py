from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AcquisitionAttribution,
    GrowthEvent,
    GrowthCampaign,
    InfluencerReferral,
    ReferralRelationship,
    ReferralCode,
    WatermarkLink,
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
        ).group_by(
            AcquisitionAttribution.first_touch_type,
            PaymentEvent.currency,
        )
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

    organic_users, organic_activated, organic_paid = db.execute(
        select(
            func.count(User.id).label("users"),
            func.count(
                case((AcquisitionAttribution.activation_at.is_not(None), User.id))
            ).label("activated"),
            func.count(
                case((AcquisitionAttribution.first_paid_at.is_not(None), User.id))
            ).label("paid"),
        )
        .outerjoin(
            AcquisitionAttribution,
            AcquisitionAttribution.user_id == User.id,
        )
        .where(
            User.created_at >= start,
            User.created_at < end,
            AcquisitionAttribution.id.is_(None),
        )
    ).one()
    if organic_users:
        result.append(
            {
                "source_type": "organic",
                "users": int(organic_users or 0),
                "activated": int(organic_activated or 0),
                "paid": int(organic_paid or 0),
            }
        )

    result.sort(key=lambda item: item["users"], reverse=True)
    return result


def _revenue_breakdown(db: Session, start: datetime, end: datetime) -> dict:
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
            PaymentEvent.currency,
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
        "total_minor": None,
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
                "currency": str(row.currency or "UNKNOWN"),
                "amount_minor": int(row.amount_minor or 0),
                "payments": int(row.payments or 0),
            }
            for row in attributed_rows
        ],
        "note": "Amounts are reported by currency in their original minor units; mixed currencies are never summed or converted without an FX source.",
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




def _source_metric_template(name: str, source_type: str, source_id: int) -> dict:
    return {
        "source_id": source_id,
        "name": name,
        "source_type": source_type,
        "clicks": 0,
        "signups": 0,
        "activated": 0,
        "paid_users": 0,
        "revenue_by_currency": {},
    }


def _add_revenue(row: dict, currency: str | None, amount_minor: int | None) -> None:
    if amount_minor is None:
        return
    code = str(currency or "UNKNOWN").upper()
    row["revenue_by_currency"][code] = (
        int(row["revenue_by_currency"].get(code, 0)) + int(amount_minor)
    )


def growth_source_details(db: Session, start: datetime, end: datetime) -> dict:
    campaigns = {
        item.id: _source_metric_template(item.name, "campaign", item.id)
        for item in db.scalars(select(GrowthCampaign).order_by(GrowthCampaign.name))
    }
    influencers = {
        item.id: _source_metric_template(item.influencer_name, "influencer", item.id)
        for item in db.scalars(select(InfluencerReferral).order_by(InfluencerReferral.influencer_name))
    }
    watermarks = {
        item.id: _source_metric_template(item.public_code, "watermark", item.id)
        for item in db.scalars(select(WatermarkLink).order_by(WatermarkLink.id))
    }

    click_rows = list(
        db.scalars(
            select(GrowthEvent).where(
                GrowthEvent.event_type.in_(["referral_link_clicked", "watermark_link_clicked"]),
                GrowthEvent.event_time >= start,
                GrowthEvent.event_time < end,
            )
        )
    )
    user_click_counts: dict[int, int] = {}
    for event in click_rows:
        if event.campaign_id in campaigns:
            campaigns[event.campaign_id]["clicks"] += 1
        if event.influencer_referral_id in influencers:
            influencers[event.influencer_referral_id]["clicks"] += 1
        if event.watermark_id in watermarks:
            watermarks[event.watermark_id]["clicks"] += 1
        if event.referrer_user_id:
            user_click_counts[event.referrer_user_id] = (
                user_click_counts.get(event.referrer_user_id, 0) + 1
            )

    attributions = list(
        db.scalars(
            select(AcquisitionAttribution).where(
                AcquisitionAttribution.signup_at >= start,
                AcquisitionAttribution.signup_at < end,
            )
        )
    )
    user_sources: dict[int, dict] = {}
    relationships = list(
        db.scalars(
            select(ReferralRelationship).order_by(ReferralRelationship.created_at)
        )
    )
    relationship_by_code = {
        rel.referral_code: rel
        for rel in relationships
        if rel.referral_code
    }
    relationship_by_referred = {
        rel.referred_user_id: rel
        for rel in relationships
    }
    referral_code_owners = {
        code.code: code.owner_user_id
        for code in db.scalars(
            select(ReferralCode).where(
                ReferralCode.owner_user_id.is_not(None),
                ReferralCode.active.is_(True),
            )
        )
        if code.code
    }
    relationship_user_ids = (
        {rel.referrer_user_id for rel in relationships}
        | {rel.referred_user_id for rel in relationships}
    )
    user_ids_needed = relationship_user_ids | set(user_click_counts)
    users_by_id = {
        user.id: user
        for user in db.scalars(
            select(User).where(User.id.in_(user_ids_needed or {-1}))
        )
    }

    for referrer_user_id, click_count in user_click_counts.items():
        referrer = users_by_id.get(referrer_user_id)
        user_sources.setdefault(
            referrer_user_id,
            _source_metric_template(
                (referrer.display_name if referrer else f"User {referrer_user_id}"),
                "user_referral",
                referrer_user_id,
            ),
        )["clicks"] += click_count

    for row in attributions:
        if row.first_touch_type == "campaign" and row.first_touch_campaign_id in campaigns:
            target = campaigns[row.first_touch_campaign_id]
        elif row.first_touch_type == "influencer" and row.first_touch_influencer_id in influencers:
            target = influencers[row.first_touch_influencer_id]
        elif row.first_touch_type == "watermark" and row.first_touch_watermark_id in watermarks:
            target = watermarks[row.first_touch_watermark_id]
        elif row.first_touch_type == "user_referral" and row.first_touch_referral_code:
            referrer_user_id = referral_code_owners.get(row.first_touch_referral_code)
            if not referrer_user_id:
                continue
            referrer = users_by_id.get(referrer_user_id)
            if not referrer:
                referrer = db.get(User, referrer_user_id)
                if referrer:
                    users_by_id[referrer_user_id] = referrer
            target = user_sources.setdefault(
                referrer_user_id,
                _source_metric_template(
                    (referrer.display_name if referrer else f"User {referrer_user_id}"),
                    "user_referral",
                    referrer_user_id,
                ),
            )
        else:
            continue
        target["signups"] += 1
        if row.activation_at is not None:
            target["activated"] += 1
        if row.first_paid_at is not None:
            target["paid_users"] += 1

    payment_rows = list(
        db.scalars(
            select(PaymentEvent).where(
                PaymentEvent.signature_verified.is_(True),
                PaymentEvent.amount_minor.is_not(None),
                PaymentEvent.processed_at >= start,
                PaymentEvent.processed_at < end,
            )
        )
    )
    payment_user_ids = {payment.user_id for payment in payment_rows if payment.user_id is not None}
    payment_attributions = list(
        db.scalars(
            select(AcquisitionAttribution).where(
                AcquisitionAttribution.user_id.in_(payment_user_ids or {-1})
            )
        )
    )
    attribution_by_user = {
        row.user_id: row
        for row in [*attributions, *payment_attributions]
    }
    for payment in payment_rows:
        attribution = attribution_by_user.get(payment.user_id)
        if not attribution:
            continue
        target = None
        if attribution.first_touch_type == "campaign":
            target = campaigns.get(attribution.first_touch_campaign_id)
        elif attribution.first_touch_type == "influencer":
            target = influencers.get(attribution.first_touch_influencer_id)
        elif attribution.first_touch_type == "watermark":
            target = watermarks.get(attribution.first_touch_watermark_id)
        elif attribution.first_touch_type == "user_referral" and attribution.first_touch_referral_code:
            referrer_user_id = referral_code_owners.get(attribution.first_touch_referral_code)
            if referrer_user_id:
                referrer = users_by_id.get(referrer_user_id) or db.get(User, referrer_user_id)
                if referrer:
                    users_by_id[referrer_user_id] = referrer
                    target = user_sources.setdefault(
                        referrer_user_id,
                        _source_metric_template(
                            referrer.display_name or f"User {referrer_user_id}",
                            "user_referral",
                            referrer_user_id,
                        ),
                    )
        if target:
            _add_revenue(target, payment.currency, payment.amount_minor)

    def finalize(items: dict[int, dict]) -> list[dict]:
        return sorted(items.values(), key=lambda item: (-item["signups"], -item["clicks"], item["name"]))

    relationship_rows = []
    for rel in relationships:
        if rel.created_at and not (start <= rel.created_at < end):
            continue
        referred = users_by_id.get(rel.referred_user_id)
        referrer = users_by_id.get(rel.referrer_user_id)
        depth = 1
        seen = {rel.referred_user_id}
        current = rel.referrer_user_id
        while current in relationship_by_referred and current not in seen:
            seen.add(current)
            parent = relationship_by_referred.get(current)
            if not parent:
                break
            depth += 1
            current = parent.referrer_user_id
        relationship_rows.append({
            "referrer_user_id": rel.referrer_user_id,
            "referrer_name": referrer.display_name if referrer else f"User {rel.referrer_user_id}",
            "referred_user_id": rel.referred_user_id,
            "referred_name": referred.display_name if referred else f"User {rel.referred_user_id}",
            "referral_code": rel.referral_code,
            "chain_depth": depth,
            "created_at": rel.created_at.isoformat() if rel.created_at else None,
        })

    return {
        "campaigns": finalize(campaigns),
        "influencers": finalize(influencers),
        "user_referrals": finalize(user_sources),
        "watermarks": finalize(watermarks),
        "referral_relationships": relationship_rows,
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
            "subscription_cancelled is recorded from verified Paystack subscription.disable events.",
            "Free Network Value is not inferred from provider cost; this snapshot reports actual free-user acquisition and recorded provider-cost telemetry.",
        ],
    }
