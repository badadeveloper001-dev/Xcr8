from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.db.models import UsageLedger, User


def admin_usage_snapshot(db: Session) -> dict:
    """Aggregate usage-ledger telemetry for the admin portal.

    Credit totals are derived from the immutable ledger. Provider costs are only
    summed when an estimated_external_cost is present; unknown provider costs are
    not treated as zero.
    """
    now = datetime.now(tz=UTC)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    today = db.scalar(
        select(func.coalesce(func.sum(UsageLedger.estimated_external_cost), 0))
        .where(
            UsageLedger.created_at >= day_start,
            UsageLedger.estimated_external_cost.is_not(None),
            UsageLedger.status.in_(("completed", "consumed")),
        )
    ) or 0
    month = db.scalar(
        select(func.coalesce(func.sum(UsageLedger.estimated_external_cost), 0))
        .where(
            UsageLedger.created_at >= month_start,
            UsageLedger.estimated_external_cost.is_not(None),
            UsageLedger.status.in_(("completed", "consumed")),
        )
    ) or 0

    rows = db.scalars(
        select(UsageLedger)
        .order_by(desc(UsageLedger.created_at), desc(UsageLedger.id))
        .limit(10_000)
    ).all()

    by_plan: dict[str, dict[str, int | float]] = {}
    by_feature: dict[str, dict[str, int | float]] = {}
    by_provider: dict[str, dict[str, int | float]] = {}
    account_costs: dict[int, float] = {}
    account_credits: dict[int, int] = {}
    failed = 0
    refunded = 0

    for row in rows:
        meta = row.event_meta if isinstance(row.event_meta, dict) else {}
        plan = str(meta.get("plan") or "unknown")
        feature = str(row.feature_type or row.event_type or "unknown")
        provider = str(row.provider or "unknown")
        credits = int(row.credits_delta or 0)
        cost = float(row.estimated_external_cost or 0)

        plan_bucket = by_plan.setdefault(plan, {"credits": 0, "estimated_external_cost": 0.0, "events": 0})
        plan_bucket["credits"] += credits
        plan_bucket["estimated_external_cost"] += cost
        plan_bucket["events"] += 1

        feature_bucket = by_feature.setdefault(feature, {"credits": 0, "estimated_external_cost": 0.0, "events": 0})
        feature_bucket["credits"] += credits
        feature_bucket["estimated_external_cost"] += cost
        feature_bucket["events"] += 1

        provider_bucket = by_provider.setdefault(provider, {"credits": 0, "estimated_external_cost": 0.0, "events": 0})
        provider_bucket["credits"] += credits
        provider_bucket["estimated_external_cost"] += cost
        provider_bucket["events"] += 1

        if row.estimated_external_cost is not None:
            account_costs[row.user_id] = account_costs.get(row.user_id, 0.0) + cost
        account_credits[row.user_id] = account_credits.get(row.user_id, 0) + credits

        if row.status == "refunded":
            refunded += 1
        if row.status == "failed":
            failed += 1

    top_user_ids = sorted(
        set(account_costs) | set(account_credits),
        key=lambda user_id: (account_costs.get(user_id, 0.0), account_credits.get(user_id, 0)),
        reverse=True,
    )[:20]
    users = {
        user.id: user
        for user in db.scalars(select(User).where(User.id.in_(top_user_ids))).all()
    } if top_user_ids else {}

    top_accounts = [
        {
            "user_id": user_id,
            "email": users.get(user_id).email if users.get(user_id) else None,
            "plan": users.get(user_id).plan_tier.value if users.get(user_id) else "unknown",
            "estimated_external_cost": account_costs.get(user_id, 0.0),
            "credits": account_credits.get(user_id, 0),
        }
        for user_id in top_user_ids
    ]

    total_users = db.scalar(select(func.count(func.distinct(UsageLedger.user_id)))) or 0
    known_cost = db.scalar(
        select(func.coalesce(func.sum(UsageLedger.estimated_external_cost), 0))
        .where(UsageLedger.estimated_external_cost.is_not(None))
    ) or 0

    return {
        "generated_at": now,
        "spend": {
            "today": float(today),
            "month": float(month),
            "known_historical": float(known_cost),
        },
        "usage": {
            "credits": int(sum(int(row.credits_delta or 0) for row in rows)),
            "failed_generations": failed,
            "refunded_events": refunded,
            "accounts": total_users,
        },
        "by_plan": by_plan,
        "by_feature": by_feature,
        "by_provider": by_provider,
        "top_accounts": top_accounts,
    }
