from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import (
    AIGeneration,
    AnalyticsSnapshot,
    ConnectedPlatform,
    ContentPost,
    CreatorProfile,
    PostStatus,
    ScheduledPost,
    TrendSignalEvent,
    User,
    Workspace,
)
from app.api.routes.intelligence import _profile_interests, _refresh_live_signals, _signal_matches_interests
from app.schemas.mvp import Cr8orAIAlert, DashboardOverview, PlatformConnection
from app.services.profile_scope import current_profile_id

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


def _localized_pending_alert(language: str, drafts: int, scheduled: int) -> Cr8orAIAlert:
    total_pending = drafts + scheduled
    if language == "nigerian_pidgin":
        message = f"You get {total_pending} pending work inside Xcr8. Make we clear am together?"
        prompt = f"Help me clear my pending work. I have {drafts} drafts and {scheduled} scheduled posts waiting."
    elif language == "yoruba":
        message = f"O ni ise to ku {total_pending} ninu Xcr8. Se ka pari won papo?"
        prompt = f"Ran mi lowo lati pari ise mi to ku. Mo ni drafts {drafts} ati scheduled posts {scheduled}."
    elif language == "code_switch":
        message = f"You still get {total_pending} pending work for Xcr8. Make we sort am out?"
        prompt = f"Help me work through my pending tasks. I have {drafts} drafts and {scheduled} scheduled posts."
    else:
        message = f"You have {total_pending} pending items in Xcr8. Want me to help you clear them?"
        prompt = f"Help me work through my pending tasks. I have {drafts} drafts and {scheduled} scheduled posts waiting."

    return Cr8orAIAlert(
        title="Cr8or AI noticed pending work",
        message=message,
        prompt=prompt,
        trend_titles=[],
        language=language or "english",
    )


def _localized_inactive_alert(language: str, inactive_days: int) -> Cr8orAIAlert:
    if language == "nigerian_pidgin":
        message = f"You never really dey active for like {inactive_days} days. Wetin dey block you? Make I help you restart."
        prompt = f"I have been inactive for about {inactive_days} days. Help me restart with the easiest high-impact next move."
    elif language == "yoruba":
        message = f"O dabi pe o ti dakẹ fun bii ojo {inactive_days}. Kini n di e mu? Je ki n ran e lowo lati bere si i tun."
        prompt = f"I have been inactive for about {inactive_days} days. Help me restart with the easiest high-impact next move."
    elif language == "code_switch":
        message = f"You have been quiet for about {inactive_days} days. Wetin happen? Make I help you bounce back."
        prompt = f"I have been inactive for about {inactive_days} days. Help me restart with the easiest high-impact next move."
    else:
        message = f"You have been inactive for about {inactive_days} days. What is blocking you? Want me to help you restart?"
        prompt = f"I have been inactive for about {inactive_days} days. Help me restart with the easiest high-impact next move."

    return Cr8orAIAlert(
        title="Cr8or AI checked in on you",
        message=message,
        prompt=prompt,
        trend_titles=[],
        language=language or "english",
    )


@router.get("/overview/{user_id}", response_model=DashboardOverview)
def overview(user_id: int, db: Session = Depends(get_db)) -> DashboardOverview:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    active_workspace_id = current_profile_id()
    active_workspace = db.get(Workspace, active_workspace_id) if active_workspace_id else None
    active_creator_name = active_workspace.name if active_workspace else user.display_name

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

    recent_post_records = list(
        db.scalars(
        select(ContentPost)
        .where(ContentPost.user_id == user_id)
        .order_by(ContentPost.created_at.desc())
        .limit(5)
        )
    )
    recent_posts = [
        {
            "post_id": post.id,
            "title": post.title,
            "status": post.status.value,
            "created_at": post.created_at.isoformat(),
            "media_url": post.media_url,
        }
        for post in recent_post_records
    ]

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user_id))
    preferences = profile.preferences if profile and isinstance(profile.preferences, dict) else {}
    niche_values = _clean_list(preferences.get("content_niche"))
    personality_values = _clean_list(preferences.get("personality"))
    niche_label = niche_values[0] if niche_values else (profile.niche if profile else "creator")
    personality_label = personality_values[0] if personality_values else (profile.tone if profile else "conversational")

    interests = _profile_interests(profile)

    def load_niche_trends() -> list[TrendSignalEvent]:
        recent = list(
            db.scalars(
                select(TrendSignalEvent)
                .where(TrendSignalEvent.user_id == user_id, TrendSignalEvent.status != "dismissed")
                .order_by(TrendSignalEvent.created_at.desc())
                .limit(100)
            )
        )
        return [row for row in recent if _signal_matches_interests(row, interests)][:3]

    trend_signal_rows = load_niche_trends()

    total_posts = db.scalar(select(func.count(ContentPost.id)).where(ContentPost.user_id == user_id)) or 0
    analytics_snapshots = (
        db.scalar(select(func.count(AnalyticsSnapshot.id)).where(AnalyticsSnapshot.user_id == user_id)) or 0
    )
    ai_generations = (
        db.scalar(
            select(func.count(AIGeneration.id))
            .join(ContentPost, AIGeneration.post_id == ContentPost.id)
            .where(ContentPost.user_id == user_id)
        )
        or 0
    )

    created_at = user.created_at
    if created_at and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    account_age_days = (datetime.now(tz=UTC) - created_at).days if created_at else 0

    has_trend_signal_readiness = (
        total_posts >= 3
        or analytics_snapshots >= 3
        or ai_generations >= 6
        or account_age_days >= 10
    )
    latest_signal_time = trend_signal_rows[0].created_at if trend_signal_rows else None
    if latest_signal_time and latest_signal_time.tzinfo is None:
        latest_signal_time = latest_signal_time.replace(tzinfo=UTC)

    should_refresh_trends = user.onboarding_complete and has_trend_signal_readiness and (
        not trend_signal_rows
        or not latest_signal_time
        or (datetime.now(tz=UTC) - latest_signal_time).total_seconds() >= 12 * 60 * 60
    )
    if should_refresh_trends:
        _refresh_live_signals(db, user, interests, "all")
        trend_signal_rows = load_niche_trends()

    trend_titles = [row.title for row in trend_signal_rows if row.title.strip()][:3]
    if not has_trend_signal_readiness:
        trend_titles = []

    user_language = str(user.language or "english").strip().lower()

    platforms = db.scalars(
        select(ConnectedPlatform).where(ConnectedPlatform.user_id == user_id)
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

    latest_post_time = recent_post_records[0].created_at if recent_post_records else None
    latest_generation_time = ai_rows[0].created_at if ai_rows else None
    last_activity_at = max(
        [value for value in [latest_post_time, latest_generation_time] if value is not None],
        default=None,
    )
    if last_activity_at and last_activity_at.tzinfo is None:
        last_activity_at = last_activity_at.replace(tzinfo=UTC)
    inactive_days = (
        max(0, (datetime.now(tz=UTC) - last_activity_at).days) if last_activity_at else 0
    )

    cr8or_ai_alert = None
    if inactive_days >= 5:
        cr8or_ai_alert = _localized_inactive_alert(user_language, inactive_days)
    elif (drafts or 0) + (scheduled or 0) >= 2:
        cr8or_ai_alert = _localized_pending_alert(user_language, drafts or 0, scheduled or 0)
    elif trend_titles and has_trend_signal_readiness:
        cr8or_ai_alert = _localized_alert(
            user_language,
            str(niche_label),
            str(personality_label),
            trend_titles,
        )

    return DashboardOverview(
        greeting="Good evening" if datetime.utcnow().hour >= 12 else "Good morning",
        creator_name=active_creator_name,
        platforms_connected=sum(1 for _ in platforms),
        drafts=drafts or 0,
        scheduled=scheduled or 0,
        ai_suggestions=len(cr8or_ai_alert.trend_titles) if cr8or_ai_alert else 0,
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
                select(ConnectedPlatform).where(ConnectedPlatform.user_id == user_id)
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
