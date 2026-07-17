from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import (
    AIGeneration,
    ConnectedPlatform,
    ContentPost,
    CreatorProfile,
    PostStatus,
    ScheduledPost,
    TrendSignalEvent,
    User,
)
from app.schemas.mvp import Cr8orAIAlert, DashboardOverview, PlatformConnection

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _clean_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    for item in value:
        text = str(item or "").strip()
        if text:
            cleaned.append(text)
    return cleaned


def _fallback_trend_titles(niche: str, personality: str) -> list[str]:
    niche_label = niche or "creator"
    personality_label = personality.lower()
    titles = [
        f"Behind-the-scenes {niche_label} storytelling",
        f"Mini-series explainers for {niche_label}",
        f"Audience choice hooks around {niche_label}",
    ]

    if any(token in personality_label for token in ["fun", "humor", "play", "bold"]):
        titles[0] = f"Relatable POV takes in {niche_label}"
        titles[2] = f"Funny hot takes that fit {niche_label}"
    elif any(token in personality_label for token in ["educat", "calm", "strategy"]):
        titles[1] = f"Myth-vs-reality breakdowns in {niche_label}"

    return titles[:3]


def _localized_alert(language: str, niche: str, personality: str, trend_titles: list[str]) -> Cr8orAIAlert:
    niche_label = niche or "creator"
    personality_label = personality or "conversational"
    trend_count = len(trend_titles)
    joined_trends = "; ".join(trend_titles)

    if language == "nigerian_pidgin":
        message = (
            f"I don spot {trend_count} trends wey match your {niche_label} niche and your {personality_label} style. "
            "You wan make we jump on them?"
        )
        prompt = (
            f"I don spot {trend_count} trends wey fit my {niche_label} niche: {joined_trends}. "
            "Break them down, tell me why them dey work, and map them to my content style."
        )
    elif language == "yoruba":
        message = (
            f"Mo ri trends {trend_count} to ba niche {niche_label} ati style {personality_label} re mu. "
            "Se o fe ka wo won papo?"
        )
        prompt = (
            f"Mo ri trends {trend_count} yi to ba niche mi mu: {joined_trends}. "
            "Tu won ka, so idi ti won fi n sise, ki o si map won si iru akoonu mi."
        )
    elif language == "code_switch":
        message = (
            f"I found {trend_count} trends wey really match your {niche_label} niche and {personality_label} vibe. "
            "Make we jump on them?"
        )
        prompt = (
            f"I found these {trend_count} trends for my niche: {joined_trends}. "
            "Break them down well and map them to my content vibe."
        )
    else:
        message = (
            f"I found {trend_count} trends that match your {niche_label} niche and {personality_label} style. "
            "Would you like to hop on them?"
        )
        prompt = (
            f"I found these {trend_count} trends for my niche: {joined_trends}. "
            "Break them down, explain why they work, and map them to my content style."
        )

    return Cr8orAIAlert(
        title="Cr8or AI spotted an opportunity",
        message=message,
        prompt=prompt,
        trend_titles=trend_titles,
        language=language or "english",
    )


@router.get("/overview/{user_id}", response_model=DashboardOverview)
def overview(user_id: int, db: Session = Depends(get_db)) -> DashboardOverview:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    drafts = db.scalar(
        select(func.count(ContentPost.id)).where(
            ContentPost.user_id == user_id, ContentPost.status == PostStatus.draft
        )
    )
    scheduled = db.scalar(
        select(func.count(ScheduledPost.id)).where(
            ScheduledPost.user_id == user_id,
            ScheduledPost.scheduled_for >= datetime.utcnow(),
        )
    )

    recent_posts_query = db.scalars(
        select(ContentPost)
        .where(ContentPost.user_id == user_id)
        .order_by(ContentPost.created_at.desc())
        .limit(5)
    )
    recent_posts = [
        {
            "post_id": post.id,
            "title": post.title,
            "status": post.status.value,
            "created_at": post.created_at.isoformat(),
            "media_url": post.media_url,
        }
        for post in recent_posts_query
    ]

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user_id))
    preferences = profile.preferences if profile and isinstance(profile.preferences, dict) else {}
    niche_values = _clean_list(preferences.get("niches"))
    personality_values = _clean_list(preferences.get("personality"))
    niche_label = niche_values[0] if niche_values else (profile.niche if profile else "creator")
    personality_label = personality_values[0] if personality_values else (profile.tone if profile else "conversational")

    trend_signal_rows = list(
        db.scalars(
            select(TrendSignalEvent)
            .where(TrendSignalEvent.user_id == user_id, TrendSignalEvent.status != "dismissed")
            .order_by(TrendSignalEvent.created_at.desc())
            .limit(3)
        )
    )
    trend_titles = [row.title for row in trend_signal_rows if row.title.strip()][:3]
    if len(trend_titles) < 3:
        trend_titles = _fallback_trend_titles(str(niche_label), str(personality_label))

    cr8or_ai_alert = _localized_alert(
        str(user.language or "english").strip().lower(),
        str(niche_label),
        str(personality_label),
        trend_titles,
    )

    platforms = db.scalars(
        select(ConnectedPlatform).where(ConnectedPlatform.user_id == user_id).limit(8)
    )

    ai_rows = list(
        db.scalars(
            select(AIGeneration)
            .join(ContentPost, AIGeneration.post_id == ContentPost.id)
            .where(ContentPost.user_id == user_id)
            .order_by(AIGeneration.created_at.desc())
            .limit(200)
        )
    )
    total_generations = len(ai_rows)
    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_latency_ms = 0
    latency_count = 0
    template_versions: dict[str, int] = {}

    for row in ai_rows:
        payload = row.output_payload or {}
        usage = payload.get("usage") if isinstance(payload, dict) else {}
        if not isinstance(usage, dict):
            usage = {}

        total_prompt_tokens += int(usage.get("prompt_tokens") or 0)
        total_completion_tokens += int(usage.get("completion_tokens") or 0)

        latency_ms = payload.get("latency_ms") if isinstance(payload, dict) else None
        if isinstance(latency_ms, int) and latency_ms >= 0:
            total_latency_ms += latency_ms
            latency_count += 1

        template = payload.get("prompt_template_version") if isinstance(payload, dict) else None
        if isinstance(template, str) and template:
            template_versions[template] = template_versions.get(template, 0) + 1

    average_latency_ms = int(total_latency_ms / latency_count) if latency_count else 0
    most_used_template = (
        max(template_versions.items(), key=lambda item: item[1])[0] if template_versions else "unknown"
    )

    return DashboardOverview(
        greeting="Good evening" if datetime.utcnow().hour >= 12 else "Good morning",
        creator_name=user.display_name,
        platforms_connected=sum(1 for _ in platforms),
        drafts=drafts or 0,
        scheduled=scheduled or 0,
        ai_suggestions=len(cr8or_ai_alert.trend_titles),
        recent_posts=recent_posts,
        ai_insights=[
            {
                "title": "Best Posting Time",
                "description": "Your audience is most active at 8PM (Wednesdays and Fridays)",
            },
            {
                "title": "Caption Style",
                "description": "Funny hooks perform 43% better for your account",
            },
        ],
        connected_platforms=[
            PlatformConnection(
                platform=platform.platform.value,
                account_handle=platform.account_handle,
                is_active=platform.is_active,
            )
            for platform in db.scalars(
                select(ConnectedPlatform).where(ConnectedPlatform.user_id == user_id).limit(8)
            )
        ],
        cr8or_ai_alert=cr8or_ai_alert,
        ai_ops={
            "total_generations": total_generations,
            "total_prompt_tokens": total_prompt_tokens,
            "total_completion_tokens": total_completion_tokens,
            "average_latency_ms": average_latency_ms,
            "most_used_template": most_used_template,
        },
    )
