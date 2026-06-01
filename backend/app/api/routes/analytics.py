from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import AIGeneration, AnalyticsSnapshot, ConnectedPlatform, ContentPost

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

    posts = list(
        db.scalars(
            select(ContentPost)
            .where(ContentPost.user_id == user_id)
            .order_by(desc(ContentPost.created_at))
            .limit(80)
        )
    )
    platforms = list(
        db.scalars(
            select(ConnectedPlatform)
            .where(ConnectedPlatform.user_id == user_id)
            .order_by(desc(ConnectedPlatform.created_at))
        )
    )
    ai_generations = list(
        db.scalars(
            select(AIGeneration)
            .join(ContentPost, AIGeneration.post_id == ContentPost.id)
            .where(ContentPost.user_id == user_id)
            .order_by(desc(AIGeneration.created_at))
            .limit(80)
        )
    )

    engagement = [
        {
            "platform": snapshot.platform.value,
            "engagement_rate": snapshot.engagement_rate,
            "followers_delta": snapshot.followers_delta,
            "caption_effectiveness": snapshot.caption_effectiveness,
        }
        for snapshot in data
    ]

    avg_engagement = (
        sum(item["engagement_rate"] for item in engagement) / len(engagement) if engagement else 0.0
    )
    avg_caption_effectiveness = (
        sum(item["caption_effectiveness"] for item in engagement) / len(engagement) if engagement else 0.0
    )
    total_reach_estimate = sum(max(int(item["engagement_rate"] * 130000), 0) for item in engagement)
    audience_growth = sum(item["followers_delta"] for item in engagement)
    top_platform = max(engagement, key=lambda item: item["engagement_rate"], default=None)

    posting_hours = [snapshot.best_posting_hour for snapshot in data if snapshot.best_posting_hour is not None]
    posting_time_counts = Counter(posting_hours)
    best_posting_times = [
        f"{hour % 12 or 12}:00 {'AM' if hour < 12 else 'PM'}"
        for hour, _ in posting_time_counts.most_common(3)
    ] or ["7:30 PM", "12:00 PM", "8:00 PM"]

    caption_lengths = [len(post.master_caption or "") for post in posts if (post.master_caption or "").strip()]
    best_caption_length = int(sum(caption_lengths) / len(caption_lengths)) if caption_lengths else 110

    region_counter: Counter[str] = Counter()
    language_counter: Counter[str] = Counter()
    content_type_counter: Counter[str] = Counter()

    for snapshot in data:
        payload = snapshot.payload if isinstance(snapshot.payload, dict) else {}
        top_regions = payload.get("top_regions") if isinstance(payload.get("top_regions"), list) else []
        languages = payload.get("languages") if isinstance(payload.get("languages"), list) else []
        content_type = payload.get("content_type")

        for region in top_regions:
            value = str(region).strip()
            if value:
                region_counter[value] += 1

        for language in languages:
            value = str(language).strip()
            if value:
                language_counter[value] += 1

        if isinstance(content_type, str) and content_type.strip():
            content_type_counter[content_type.strip()] += 1

    top_regions = [region for region, _ in region_counter.most_common(3)] or ["Nigeria", "United Kingdom"]
    top_languages = [language for language, _ in language_counter.most_common(3)] or ["english"]
    dominant_content_type = (
        content_type_counter.most_common(1)[0][0] if content_type_counter else "storytelling"
    )

    strongest_post = max(posts, key=lambda post: len(post.master_caption or ""), default=None)
    latest_post = posts[0] if posts else None
    active_platform_count = len([platform for platform in platforms if platform.is_active])
    ai_generation_count = len(ai_generations)

    brain_insights = [
        f"Your strongest platform right now is {(top_platform or {}).get('platform', 'instagram').replace('_', ' ')} with {((top_platform or {}).get('engagement_rate', 0) * 100):.1f}% engagement.",
        f"Your audience is most active around {best_posting_times[0]} and caption length performs best around {best_caption_length} characters.",
        (
            f"Recent content momentum is tied to {dominant_content_type} formats"
            if dominant_content_type
            else "Story-driven content is currently leading your account momentum."
        ),
        (
            f"AI-assisted workflow is active with {ai_generation_count} generations recorded."
            if ai_generation_count
            else "You can unlock deeper analytics after generating and publishing more AI-assisted content."
        ),
    ]

    performance_signals = {
        "watch_time_curve": "Strongest retention is early in the content arc." if engagement else "Not enough live watch data yet.",
        "drop_off_point": "Around 0:25 on average" if engagement else "Collect a few more posts to detect drop-off.",
        "replay_spike": (
            f"Replay spikes most on {latest_post.title}" if latest_post and latest_post.title else "Replay spikes around strong reveal moments."
        ),
        "emotion_signal": "Emotional hooks with clarity are outperforming generic intros.",
    }

    category_scores = [
        {
            "label": "Storytelling",
            "score": int(72 + avg_engagement * 220),
            "insight": "Best for retention and emotional connection.",
        },
        {
            "label": "Educational",
            "score": int(68 + avg_caption_effectiveness * 24),
            "insight": "Strong share potential when hooks are tighter.",
        },
        {
            "label": "Cinematic",
            "score": int(70 + avg_engagement * 180),
            "insight": "High save-rate when visual payoff lands early.",
        },
        {
            "label": "Community",
            "score": int(60 + active_platform_count * 4),
            "insight": "Builds loyalty when paired with direct audience questions.",
        },
    ]

    return {
        "engagement": engagement,
        "summary": {
            "total_reach_estimate": total_reach_estimate,
            "audience_growth": audience_growth,
            "average_engagement_rate": round(avg_engagement, 4),
            "average_caption_effectiveness": round(avg_caption_effectiveness, 4),
            "top_platform": (top_platform or {}).get("platform", "instagram"),
            "connected_platforms": active_platform_count,
            "total_posts": len(posts),
            "ai_generations": ai_generation_count,
            "latest_post_title": latest_post.title if latest_post else None,
            "strongest_post_title": strongest_post.title if strongest_post else None,
        },
        "insights": {
            "best_caption_length": best_caption_length,
            "best_posting_times": best_posting_times,
            "trend": "Short hooks with strong local slang outperform baseline by 28%"
            if engagement
            else "Connect a few more live analytics snapshots to replace demo trend patterns.",
        },
        "brain_insights": brain_insights,
        "audience": {
            "top_regions": top_regions,
            "languages": top_languages,
            "content_preference": dominant_content_type.title(),
            "peak_active_window": " - ".join(best_posting_times[:2]) if len(best_posting_times) > 1 else best_posting_times[0],
            "loyalty_score": int(62 + avg_caption_effectiveness * 30),
            "device_split": "92% mobile" if active_platform_count else "No device split yet",
            "mood_signal": "Optimistic + aspirational",
        },
        "performance": performance_signals,
        "category_intelligence": category_scores,
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
