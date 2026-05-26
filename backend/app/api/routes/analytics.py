from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import AIGeneration, AnalyticsSnapshot, ContentPost

router = APIRouter(prefix="/analytics", tags=["analytics"])


_MODEL_COST_PER_1M = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
}


@router.get("/overview/{user_id}")
def analytics_overview(user_id: int, db: Session = Depends(get_db)) -> dict:
    snapshots = db.scalars(
        select(AnalyticsSnapshot)
        .where(AnalyticsSnapshot.user_id == user_id)
        .order_by(desc(AnalyticsSnapshot.created_at))
        .limit(30)
    )
    data = list(snapshots)

    return {
        "engagement": [
            {
                "platform": snapshot.platform.value,
                "engagement_rate": snapshot.engagement_rate,
                "followers_delta": snapshot.followers_delta,
                "caption_effectiveness": snapshot.caption_effectiveness,
            }
            for snapshot in data
        ],
        "insights": {
            "best_caption_length": 110,
            "best_posting_times": ["20:00", "19:30", "12:00"],
            "trend": "Short hooks with strong local slang outperform baseline by 28%",
        },
    }


@router.get("/ai-usage/{user_id}")
def ai_usage_summary(user_id: int, db: Session = Depends(get_db)) -> dict:
    rows = list(
        db.scalars(
            select(AIGeneration)
            .join(ContentPost, AIGeneration.post_id == ContentPost.id)
            .where(ContentPost.user_id == user_id)
            .order_by(desc(AIGeneration.created_at))
            .limit(200)
        )
    )

    total_generations = len(rows)
    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_latency_ms = 0
    latency_count = 0
    template_versions: dict[str, int] = {}
    model_counts: dict[str, int] = {}
    estimated_cost_usd = 0.0

    for row in rows:
        model_name = row.model_name or "unknown"
        model_counts[model_name] = model_counts.get(model_name, 0) + 1

        payload = row.output_payload or {}
        usage = payload.get("usage") if isinstance(payload, dict) else {}
        if not isinstance(usage, dict):
            usage = {}

        prompt_tokens = int(usage.get("prompt_tokens") or 0)
        completion_tokens = int(usage.get("completion_tokens") or 0)
        total_prompt_tokens += prompt_tokens
        total_completion_tokens += completion_tokens

        rates = _MODEL_COST_PER_1M.get(model_name)
        if rates:
            estimated_cost_usd += (prompt_tokens / 1_000_000) * rates["input"]
            estimated_cost_usd += (completion_tokens / 1_000_000) * rates["output"]

        latency_ms = payload.get("latency_ms") if isinstance(payload, dict) else None
        if isinstance(latency_ms, int) and latency_ms >= 0:
            total_latency_ms += latency_ms
            latency_count += 1

        prompt_template_version = payload.get("prompt_template_version") if isinstance(payload, dict) else None
        if isinstance(prompt_template_version, str) and prompt_template_version:
            template_versions[prompt_template_version] = (
                template_versions.get(prompt_template_version, 0) + 1
            )

    average_latency_ms = int(total_latency_ms / latency_count) if latency_count else 0
    most_used_template = (
        max(template_versions.items(), key=lambda item: item[1])[0] if template_versions else "unknown"
    )

    return {
        "total_generations": total_generations,
        "total_prompt_tokens": total_prompt_tokens,
        "total_completion_tokens": total_completion_tokens,
        "average_latency_ms": average_latency_ms,
        "estimated_cost_usd": round(estimated_cost_usd, 6),
        "models": model_counts,
        "template_versions": template_versions,
        "most_used_template": most_used_template,
    }
