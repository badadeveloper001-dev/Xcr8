from __future__ import annotations

from datetime import UTC, datetime
import json
import logging
import re
import uuid
from collections import Counter, defaultdict

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import (
    AIGeneration,
    AnalyticsSnapshot,
    ConnectedPlatform,
    ContentPost,
    CreatorMemory,
    CreatorProfile,
    PostStatus,
    User,
)
from app.schemas.mvp import (
    AIAssistantChatHistory,
    AIAssistantChatCreateRequest,
    AIAssistantChatSummary,
    AIAssistantRequest,
    AIAssistantResponse,
    AIBrainstormRequest,
    AIBrainstormResponse,
    AIComposeRequest,
    AIComposeResponse,
    AITrendMapperRequest,
    AITrendMapperResponse,
    AITrendSignal,
)
from app.services.ai_adapter import generate_composed_content, generate_content_ideas

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)

ASSISTANT_CHAT_MEMORY_TYPE = "assistant_chat"
ASSISTANT_CHAT_MEMORY_KEY = "assistant_long_chat_memory_v1"
ASSISTANT_CHAT_MEMORY_PREFIX = "assistant_chat:"
ASSISTANT_CHAT_MAX_MESSAGES = 120
ASSISTANT_REQUEST_MESSAGE_LIMIT = 40
APP_FEATURE_CATALOG = [
    {
        "name": "Dashboard",
        "route": "/dashboard",
        "description": "Creator home with activity summary, insights, and shortcuts.",
    },
    {
        "name": "Analytics",
        "route": "/analytics",
        "description": "Performance intelligence, audience signals, and growth analysis.",
    },
    {
        "name": "AI Studio",
        "route": "/ai-studio",
        "description": "Workspace for AI tools like Cr8or AI, Composer, Brainstorm, and more.",
    },
    {
        "name": "Cr8or AI",
        "route": "/ai-studio/assistant",
        "description": "Long-running conversational assistant for app guidance and strategy.",
    },
    {
        "name": "Composer",
        "route": "/ai-studio/composer",
        "description": "Chat-based post drafting and idea-to-caption creation.",
    },
    {
        "name": "Brainstorm",
        "route": "/ai-studio/brainstorm",
        "description": "Generates batches of hooks, angles, and content ideas.",
    },
    {
        "name": "Image Generator",
        "route": "/ai-studio/image-generator",
        "description": "Visual concept generation for covers, ads, thumbnails, and promos.",
    },
    {
        "name": "Calendar",
        "route": "/calendar",
        "description": "Upcoming schedule, queued posts, and time management.",
    },
    {
        "name": "Compose",
        "route": "/compose",
        "description": "Distribution and caption workflow for turning prompts into posts.",
    },
    {
        "name": "Upload",
        "route": "/upload",
        "description": "Media ingestion and reusable asset storage.",
    },
    {
        "name": "Settings",
        "route": "/settings",
        "description": "Profile, theme, account, and workspace preferences.",
    },
    {
        "name": "Onboarding",
        "route": "/onboarding",
        "description": "Initial creator setup and preference capture.",
    },
]


def _coalesce_value(value: str | None, fallback: str) -> str:
    cleaned = str(value or "").strip()
    return cleaned or fallback


def _is_auto_or_empty(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"", "auto"}


def _detect_message_language(message: str, fallback_language: str = "english") -> str:
    text = str(message or "").strip()
    if not text:
        return _coalesce_value(fallback_language, "english")

    lowered = text.lower()

    if re.search(r"[\u0600-\u06ff]", text):
        return "arabic"
    if re.search(r"[\u0900-\u097f]", text):
        return "hindi"
    if re.search(r"[\u4e00-\u9fff]", text):
        return "chinese"
    if re.search(r"[\u3040-\u30ff]", text):
        return "japanese"
    if re.search(r"[\uac00-\ud7af]", text):
        return "korean"
    if re.search(r"[\u0400-\u04ff]", text):
        return "russian"

    yoruba_markers = ["ṣ", "ọ", "ẹ", "ń", "à", "á", "è", "é", "ì", "í", "ò", "ó", "ù", "ú"]
    yoruba_words = [
        "bawo",
        "ẹ",
        "jọwọ",
        "mo",
        "lọwọ",
        "lọwọlọwọ",
        "ṣe",
        "nitorinaa",
        "kí",
        "jẹ",
        "ọwọ",
        "ẹ ṣe",
    ]
    pidgin_words = [
        "abeg",
        "abi",
        "dey",
        "wetin",
        "una",
        "wahala",
        "how far",
        "no wahala",
        "shey",
        "sha",
        "don",
        "comot",
        "make we",
    ]
    french_words = ["bonjour", "merci", "s'il", "avec", "pour", "vous", "nous", "est-ce", "francais"]
    spanish_words = ["hola", "gracias", "por favor", "como", "estoy", "quiero", "necesito", "usted"]
    portuguese_words = ["ola", "obrigado", "voce", "preciso", "quero", "agora", "com", "para"]

    if any(marker in lowered for marker in yoruba_markers) or sum(word in lowered for word in yoruba_words) >= 2:
        return "yoruba"
    if sum(word in lowered for word in pidgin_words) >= 2:
        return "nigerian_pidgin"
    if sum(word in lowered for word in french_words) >= 2:
        return "french"
    if sum(word in lowered for word in spanish_words) >= 2:
        return "spanish"
    if sum(word in lowered for word in portuguese_words) >= 2:
        return "portuguese"

    return _coalesce_value(fallback_language, "english")


def _build_missing_user_assistant_response(payload: AIAssistantRequest) -> AIAssistantResponse:
    resolved_language = (
        _detect_message_language(payload.message, "english")
        if _is_auto_or_empty(payload.language)
        else payload.language
    )
    resolved_tone = "conversational" if _is_auto_or_empty(payload.tone) else payload.tone

    return AIAssistantResponse(
        chat_id=payload.chat_id,
        assistant_message=(
            "I can still help with content strategy and next steps, but I could not load your account context yet. "
            "Please refresh or sign in again so I can personalize your assistant replies."
        ),
        follow_up_question="Want me to give you a quick content plan while you reconnect your session?",
        suggested_actions=[
            "Quick content plan for this week",
            "Caption ideas for my niche",
            "Growth actions I can do today",
        ],
        language=resolved_language,
        tone=resolved_tone,
        model="backend-local-assistant-missing-user",
        prompt_template_version="assistant-v1",
        latency_ms=0,
        usage={"prompt_tokens": None, "completion_tokens": None, "total_tokens": None},
    )


def _compact_text(value: str, max_chars: int) -> str:
    cleaned = " ".join(str(value or "").split())
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[-max_chars:]


def _normalize_chat_id(chat_id: str | None) -> str:
    cleaned = str(chat_id or "").strip()
    if not cleaned:
        return "default"
    return cleaned[:120]


def _assistant_chat_memory_key(chat_id: str) -> str:
    return f"{ASSISTANT_CHAT_MEMORY_PREFIX}{chat_id}"


def _generate_chat_id() -> str:
    return f"chat-{uuid.uuid4().hex[:12]}"


def _normalize_email(value: str | None) -> str:
    return str(value or "").strip().lower()


def _parse_chat_memory_record(memory_record: CreatorMemory | None) -> dict | None:
    if not memory_record or not memory_record.memory_value:
        return None

    try:
        parsed = json.loads(memory_record.memory_value)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed, dict):
        return None

    messages = parsed.get("messages")
    if not isinstance(messages, list):
        parsed["messages"] = []

    return parsed


def _build_chat_title(messages: list[dict], fallback: str = "New chat") -> str:
    first_user_message = next(
        (str(message.get("content") or "").strip() for message in messages if message.get("role") == "user"),
        "",
    )
    title = first_user_message or fallback
    return _compact_text(title, 56)


def _get_assistant_chat_memory(db: Session, user_id: int, chat_id: str) -> CreatorMemory | None:
    return db.scalar(
        select(CreatorMemory)
        .where(
            CreatorMemory.user_id == user_id,
            CreatorMemory.memory_type == ASSISTANT_CHAT_MEMORY_TYPE,
            CreatorMemory.memory_key == _assistant_chat_memory_key(chat_id),
        )
        .order_by(desc(CreatorMemory.created_at))
        .limit(1)
    )


def _get_legacy_assistant_chat_memory(db: Session, user_id: int) -> CreatorMemory | None:
    return db.scalar(
        select(CreatorMemory)
        .where(
            CreatorMemory.user_id == user_id,
            CreatorMemory.memory_type == ASSISTANT_CHAT_MEMORY_TYPE,
            CreatorMemory.memory_key == ASSISTANT_CHAT_MEMORY_KEY,
        )
        .order_by(desc(CreatorMemory.created_at))
        .limit(1)
    )


def _serialize_recent_messages(payload: AIAssistantRequest) -> list[dict]:
    return [message.model_dump() for message in payload.messages[-ASSISTANT_REQUEST_MESSAGE_LIMIT:]]


def _build_persisted_assistant_message(assistant_message: str, follow_up_question: str | None) -> str:
    primary = str(assistant_message or "").strip()
    follow_up = str(follow_up_question or "").strip()
    if primary and follow_up:
        return f"{primary} {follow_up}".strip()
    return primary or follow_up


def _build_chat_payload(chat_id: str, title: str, messages: list[dict], updated_at: str) -> dict:
    return {
        "chat_id": chat_id,
        "title": title,
        "updated_at": updated_at,
        "messages": messages,
    }


def _save_chat_payload(db: Session, user_id: int, chat_id: str, payload: dict) -> CreatorMemory:
    now = datetime.now(tz=UTC)
    memory_record = _get_assistant_chat_memory(db, user_id, chat_id)
    target = memory_record or CreatorMemory(
        user_id=user_id,
        memory_type=ASSISTANT_CHAT_MEMORY_TYPE,
        memory_key=_assistant_chat_memory_key(chat_id),
        memory_value="",
    )
    target.memory_value = json.dumps(payload)
    target.confidence_score = 0.95
    target.last_used_at = now
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


def _persist_assistant_chat_memory(
    db: Session,
    user_id: int,
    chat_id: str,
    memory_record: CreatorMemory | None,
    user_message: str,
    assistant_message: str,
) -> None:
    now = datetime.now(tz=UTC)
    existing_payload = _parse_chat_memory_record(memory_record) or {
        "chat_id": chat_id,
        "title": _build_chat_title([]),
        "updated_at": now.isoformat(),
        "messages": [],
    }
    existing_messages = existing_payload.get("messages") if isinstance(existing_payload.get("messages"), list) else []
    updated_messages = [
        *existing_messages,
        {"role": "user", "content": _compact_text(user_message, 1800)},
        {"role": "assistant", "content": _compact_text(assistant_message, 2600)},
    ][-ASSISTANT_CHAT_MAX_MESSAGES:]
    try:
        stored_payload = _build_chat_payload(
            chat_id=chat_id,
            title=_build_chat_title(updated_messages),
            updated_at=now.isoformat(),
            messages=updated_messages,
        )
        _save_chat_payload(db, user_id, chat_id, stored_payload)
    except Exception as exc:
        db.rollback()
        logger.warning("Unable to persist assistant chat memory for user %s: %s", user_id, exc)


def _resolve_assistant_user(db: Session, payload: AIAssistantRequest) -> User | None:
    user = db.get(User, payload.user_id)
    if user:
        return user

    if payload.email:
        normalized_email = _normalize_email(payload.email)
        return db.scalar(select(User).where(func.lower(User.email) == normalized_email))

    return None


def _resolve_user_by_identity(db: Session, user_id: int, email: str | None) -> User | None:
    user = db.get(User, user_id)
    if user:
        return user
    if email:
        normalized_email = _normalize_email(email)
        return db.scalar(select(User).where(func.lower(User.email) == normalized_email))
    return None


def _build_chat_history_response(memory_record: CreatorMemory, fallback_chat_id: str) -> AIAssistantChatHistory:
    payload = _parse_chat_memory_record(memory_record) or {}
    messages = payload.get("messages") if isinstance(payload.get("messages"), list) else []
    updated_at = str(payload.get("updated_at") or memory_record.last_used_at or memory_record.created_at)
    title = str(payload.get("title") or _build_chat_title(messages))

    return AIAssistantChatHistory(
        chat_id=str(payload.get("chat_id") or fallback_chat_id),
        title=title,
        updated_at=updated_at,
        messages=messages,
    )


def _build_legacy_chat_summary(memory_record: CreatorMemory) -> AIAssistantChatSummary | None:
    if not memory_record.memory_value:
        return None

    preview = _compact_text(memory_record.memory_value.replace("\n", " "), 90)
    return AIAssistantChatSummary(
        chat_id="default",
        title="Earlier Cr8or AI chat",
        preview=preview or "Your earlier Cr8or AI memory.",
        updated_at=str(memory_record.last_used_at or memory_record.created_at),
    )


def _build_app_context(profile: CreatorProfile | None, user: User, db: Session) -> dict:
    base_context = _build_assistant_context(db, user, profile)
    base_context["feature_catalog"] = APP_FEATURE_CATALOG
    base_context["workspace_map"] = {
        "primary_ai_tool": "Cr8or AI",
        "studio_tools": [feature["name"] for feature in APP_FEATURE_CATALOG if feature["route"].startswith("/ai-studio")],
        "core_routes": [feature["route"] for feature in APP_FEATURE_CATALOG],
    }
    return base_context


def _build_creator_memory(
    profile: CreatorProfile | None,
    payload_language: str,
    prompt_seed: str,
    recent_memories: list[CreatorMemory],
) -> dict:
    preferences = (profile.preferences or {}) if profile else {}
    raw_personality = preferences.get("personality") if isinstance(preferences, dict) else None
    raw_audience_location = preferences.get("audience_location") if isinstance(preferences, dict) else None

    if isinstance(raw_personality, list):
        personality = ", ".join(str(item).strip() for item in raw_personality if str(item).strip()) or None
    else:
        personality = str(raw_personality).strip() if raw_personality else None

    if isinstance(raw_audience_location, list):
        audience_location = ", ".join(
            str(item).strip() for item in raw_audience_location if str(item).strip()
        ) or None
    else:
        audience_location = str(raw_audience_location).strip() if raw_audience_location else None

    memory_facts = [
        f"{memory.memory_key}: {memory.memory_value}"
        for memory in recent_memories
        if memory.memory_key and memory.memory_value
    ]

    return {
        "tone": profile.tone if profile else "conversational",
        "emoji_style": profile.emoji_style if profile else "🔥",
        "slang_profile": profile.slang_profile if profile else "light",
        "niche": profile.niche if profile else prompt_seed,
        "preferred_caption_length": profile.preferred_caption_length if profile else 120,
        "personality": personality,
        "audience_location": audience_location,
        "multilingual_profile": profile.multilingual_profile if profile else [payload_language],
        "memory_facts": memory_facts,
    }


def _build_assistant_context(db: Session, user: User, profile: CreatorProfile | None) -> dict:
    recent_memories = list(
        db.scalars(
            select(CreatorMemory)
            .where(CreatorMemory.user_id == user.id)
            .order_by(
                desc(CreatorMemory.confidence_score),
                desc(CreatorMemory.last_used_at),
                desc(CreatorMemory.created_at),
            )
            .limit(6)
        )
    )

    recent_posts = [
        {
            "title": post.title,
            "status": post.status.value,
            "media_type": post.media_type,
            "media_url": post.media_url,
            "primary_language": post.primary_language,
            "selected_platforms": post.selected_platforms,
            "created_at": post.created_at.isoformat() if post.created_at else None,
        }
        for post in db.scalars(
            select(ContentPost)
            .where(ContentPost.user_id == user.id)
            .order_by(desc(ContentPost.created_at))
            .limit(4)
        )
    ]

    recent_generations = [
        {
            "generation_type": generation.generation_type,
            "model_name": generation.model_name,
            "created_at": generation.created_at.isoformat() if generation.created_at else None,
            "post_title": generation.post.title if generation.post else None,
        }
        for generation in db.scalars(
            select(AIGeneration)
            .join(ContentPost, AIGeneration.post_id == ContentPost.id)
            .where(ContentPost.user_id == user.id)
            .order_by(desc(AIGeneration.created_at))
            .limit(4)
        )
    ]

    connected_platforms = [
        {
            "platform": platform.platform.value,
            "account_handle": platform.account_handle,
            "is_active": platform.is_active,
        }
        for platform in db.scalars(
            select(ConnectedPlatform)
            .where(ConnectedPlatform.user_id == user.id)
            .order_by(desc(ConnectedPlatform.created_at))
            .limit(8)
        )
    ]

    drafts = db.scalar(
        select(func.count()).select_from(ContentPost).where(
            ContentPost.user_id == user.id,
            ContentPost.status == PostStatus.draft,
        )
    )
    scheduled = db.scalar(
        select(func.count()).select_from(ContentPost).where(
            ContentPost.user_id == user.id,
            ContentPost.status == PostStatus.scheduled,
        )
    )
    published = db.scalar(
        select(func.count()).select_from(ContentPost).where(
            ContentPost.user_id == user.id,
            ContentPost.status == PostStatus.published,
        )
    )

    return {
        "user": {
            "id": user.id,
            "display_name": user.display_name,
            "language": user.language,
            "timezone": user.timezone,
            "onboarding_complete": user.onboarding_complete,
        },
        "profile": {
            "niche": profile.niche if profile else "creator",
            "tone": profile.tone if profile else user.language,
            "emoji_style": profile.emoji_style if profile else "🔥✨",
            "slang_profile": profile.slang_profile if profile else "light",
            "multilingual_profile": profile.multilingual_profile if profile else [user.language],
            "preferred_caption_length": profile.preferred_caption_length if profile else 120,
            "preferences": profile.preferences if profile else {},
        },
        "summary": {
            "drafts": drafts or 0,
            "scheduled": scheduled or 0,
            "published": published or 0,
            "platforms_connected": len(connected_platforms),
        },
        "recent_memories": [
            {
                "memory_type": memory.memory_type,
                "memory_key": memory.memory_key,
                "memory_value": memory.memory_value,
                "confidence_score": memory.confidence_score,
            }
            for memory in recent_memories
        ],
        "recent_posts": recent_posts,
        "recent_generations": recent_generations,
        "connected_platforms": connected_platforms,
        "built_at": datetime.now(tz=UTC).isoformat(),
    }


def _normalized_platform(value: str | None) -> str:
    cleaned = str(value or "").strip().lower()
    if not cleaned:
        return "all"
    return cleaned


def _fallback_trend_signals(payload: AITrendMapperRequest) -> list[AITrendSignal]:
    platform = payload.platform if payload.platform != "all" else "cross-platform"
    topic = payload.topic.strip()
    return [
        AITrendSignal(
            title=f"{topic} narrative hooks are rising",
            why_now="Story-led formats are keeping attention longer in current creator cycles.",
            angle=f"Frame {topic} as a before-and-after transformation with one concrete lesson.",
            hook=f"If you're posting {topic}, this one switch can double saves this week.",
            action="Draft a 3-part post arc and publish the first part during your next evening slot.",
            platform=platform,
            confidence_score=0.61,
        ),
        AITrendSignal(
            title="Comment-driven prompts are outperforming static captions",
            why_now="Posts that ask for a direct audience response are generating stronger distribution loops.",
            angle="End each caption with a fast binary choice so people respond in one tap.",
            hook="Hot take: your CTA is too passive. Ask this instead.",
            action="Run a 48-hour experiment with 2 interactive caption endings and compare saves/comments.",
            platform=platform,
            confidence_score=0.58,
        ),
        AITrendSignal(
            title="Mini-series format is gaining traction",
            why_now="Sequenced posts are increasing repeat viewer return rate versus one-off drops.",
            angle=f"Turn {topic} into a 5-part mini-series with a strong payoff in part 3.",
            hook="Part 1 of 5: this is where most creators miss momentum.",
            action="Create a weekly series board in Calendar and pre-write all 5 hooks.",
            platform=platform,
            confidence_score=0.55,
        ),
    ]


@router.post("/trend-mapper", response_model=AITrendMapperResponse)
def trend_mapper(payload: AITrendMapperRequest, db: Session = Depends(get_db)) -> AITrendMapperResponse:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    platform_filter = _normalized_platform(payload.platform)
    snapshots = list(
        db.scalars(
            select(AnalyticsSnapshot)
            .where(AnalyticsSnapshot.user_id == payload.user_id)
            .order_by(desc(AnalyticsSnapshot.created_at))
            .limit(140)
        )
    )

    if not snapshots:
        base_signals = _fallback_trend_signals(payload)
        return AITrendMapperResponse(
            topic=payload.topic,
            goal=payload.goal,
            platform=platform_filter,
            window=payload.window,
            generated_at=datetime.now(tz=UTC).isoformat(),
            summary="Trend Mapper is live. Connect more analytics snapshots for higher-confidence signals.",
            signals=base_signals,
            source_stats={"snapshots": 0, "posts": 0, "ai_generations": 0},
        )

    filtered_snapshots = [
        item
        for item in snapshots
        if item.metric_window == payload.window and (platform_filter == "all" or item.platform.value == platform_filter)
    ]
    if not filtered_snapshots:
        filtered_snapshots = [
            item
            for item in snapshots
            if platform_filter == "all" or item.platform.value == platform_filter
        ]

    posts = list(
        db.scalars(
            select(ContentPost)
            .where(ContentPost.user_id == payload.user_id)
            .order_by(desc(ContentPost.created_at))
            .limit(80)
        )
    )
    generations = list(
        db.scalars(
            select(AIGeneration)
            .join(ContentPost, AIGeneration.post_id == ContentPost.id)
            .where(ContentPost.user_id == payload.user_id)
            .order_by(desc(AIGeneration.created_at))
            .limit(80)
        )
    )

    grouped: dict[str, list] = defaultdict(list)
    regions: Counter[str] = Counter()
    languages: Counter[str] = Counter()

    for snapshot in sorted(filtered_snapshots, key=lambda item: item.created_at or datetime.now(tz=UTC), reverse=True):
        platform_name = snapshot.platform.value
        grouped[platform_name].append(snapshot)
        payload_blob = snapshot.payload if isinstance(snapshot.payload, dict) else {}
        for region in payload_blob.get("top_regions", []) if isinstance(payload_blob.get("top_regions"), list) else []:
            region_value = str(region).strip()
            if region_value:
                regions[region_value] += 1
        for language in payload_blob.get("languages", []) if isinstance(payload_blob.get("languages"), list) else []:
            language_value = str(language).strip()
            if language_value:
                languages[language_value] += 1

    signals: list[AITrendSignal] = []
    topic_seed = payload.topic.strip()

    for platform_name, platform_snapshots in grouped.items():
        current = platform_snapshots[0]
        previous = platform_snapshots[1] if len(platform_snapshots) > 1 else None
        engagement_delta = current.engagement_rate - (previous.engagement_rate if previous else 0.0)
        follower_delta = current.followers_delta - (previous.followers_delta if previous else 0)
        best_hour = current.best_posting_hour or 20
        best_time = f"{best_hour % 12 or 12}:00 {'AM' if best_hour < 12 else 'PM'}"

        confidence = max(
            0.41,
            min(
                0.96,
                0.46
                + (current.caption_effectiveness * 0.28)
                + (current.engagement_rate * 1.8)
                + (0.07 if engagement_delta >= 0 else -0.03)
                + (0.04 if follower_delta >= 0 else -0.02),
            ),
        )

        trend_direction = "rising" if engagement_delta >= 0 else "cooling"
        signals.append(
            AITrendSignal(
                title=f"{platform_name.replace('_', ' ').title()} engagement is {trend_direction}",
                why_now=(
                    f"Current engagement is {(current.engagement_rate * 100):.1f}% with followers delta {current.followers_delta:+d}."
                ),
                angle=(
                    f"Publish {topic_seed} with a stronger first-line hook and local context tailored to {platform_name.replace('_', ' ')}."
                ),
                hook=f"Creators in this lane are winning by framing {topic_seed} in one clear punchline.",
                action=f"Ship the next {platform_name.replace('_', ' ')} post around {best_time} and compare against your last two drops.",
                platform=platform_name,
                confidence_score=round(confidence, 2),
            )
        )

    top_region = regions.most_common(1)[0][0] if regions else "your primary audience"
    top_language = languages.most_common(1)[0][0] if languages else user.language
    if grouped:
        signals.append(
            AITrendSignal(
                title="Audience context is an immediate lever",
                why_now=f"Most recent snapshots lean toward {top_region} in {top_language} conversations.",
                angle=f"Localize your next {topic_seed} post with one culturally specific example.",
                hook="If this post sounds like everyone else, your audience scrolls.",
                action="Generate 3 localized caption variants and publish the highest-confidence one this week.",
                platform=platform_filter,
                confidence_score=0.64,
            )
        )

    if generations:
        signals.append(
            AITrendSignal(
                title="AI-assisted workflows are ready to scale",
                why_now=f"You have {len(generations)} recent AI generations to mine for winning format patterns.",
                angle="Recycle top-performing hooks into a recurring series instead of one-off experiments.",
                hook="Your next growth jump is consistency, not complexity.",
                action="Use Composer + Calendar to queue a 7-day sequence using one proven hook pattern.",
                platform=platform_filter,
                confidence_score=0.6,
            )
        )

    ranked = sorted(signals, key=lambda item: item.confidence_score, reverse=True)[:6]
    if not ranked:
        ranked = _fallback_trend_signals(payload)

    summary = (
        f"Trend Mapper found {len(ranked)} actionable signals across {len(grouped)} platform"
        f"{'s' if len(grouped) != 1 else ''} for '{topic_seed}'."
    )

    return AITrendMapperResponse(
        topic=payload.topic,
        goal=payload.goal,
        platform=platform_filter,
        window=payload.window,
        generated_at=datetime.now(tz=UTC).isoformat(),
        summary=summary,
        signals=ranked,
        source_stats={
            "snapshots": len(filtered_snapshots),
            "posts": len(posts),
            "ai_generations": len(generations),
            "platforms_analyzed": len(grouped),
        },
    )


@router.post("/brainstorm", response_model=AIBrainstormResponse)
def brainstorm(payload: AIBrainstormRequest, db: Session = Depends(get_db)) -> AIBrainstormResponse:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == payload.user_id))
    recent_memories = list(
        db.scalars(
            select(CreatorMemory)
            .where(CreatorMemory.user_id == payload.user_id)
            .order_by(
                desc(CreatorMemory.confidence_score),
                desc(CreatorMemory.last_used_at),
                desc(CreatorMemory.created_at),
            )
            .limit(6)
        )
    )

    creator_memory = _build_creator_memory(profile, payload.language, payload.topic, recent_memories)

    result = generate_content_ideas(
        {
            "topic": payload.topic,
            "platform": payload.platform,
            "language": payload.language,
            "goal": payload.goal,
            "tone": payload.tone,
            "audience_location": payload.audience_location,
            "creator_memory": creator_memory,
        }
    )

    return AIBrainstormResponse(**result)


@router.post("/compose", response_model=AIComposeResponse)
def compose(payload: AIComposeRequest, db: Session = Depends(get_db)) -> AIComposeResponse:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == payload.user_id))
    recent_memories = list(
        db.scalars(
            select(CreatorMemory)
            .where(CreatorMemory.user_id == payload.user_id)
            .order_by(
                desc(CreatorMemory.confidence_score),
                desc(CreatorMemory.last_used_at),
                desc(CreatorMemory.created_at),
            )
            .limit(6)
        )
    )

    creator_memory = _build_creator_memory(profile, payload.language, payload.prompt, recent_memories)

    result = generate_composed_content(
        {
            "user_id": payload.user_id,
            "prompt": payload.prompt,
            "platform": payload.platform,
            "language": payload.language,
            "tone": payload.tone,
            "audience_location": payload.audience_location,
            "creator_memory": creator_memory,
            "messages": [message.model_dump() for message in payload.messages],
        }
    )

    return AIComposeResponse(**result)


@router.post("/assistant", response_model=AIAssistantResponse)
def assistant(payload: AIAssistantRequest, db: Session = Depends(get_db)) -> AIAssistantResponse:
    user = _resolve_assistant_user(db, payload)
    if not user:
        return _build_missing_user_assistant_response(payload)

    chat_id = _normalize_chat_id(payload.chat_id) if payload.chat_id else _generate_chat_id()

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    recent_memories = list(
        db.scalars(
            select(CreatorMemory)
            .where(CreatorMemory.user_id == user.id)
            .order_by(
                desc(CreatorMemory.confidence_score),
                desc(CreatorMemory.last_used_at),
                desc(CreatorMemory.created_at),
            )
            .limit(6)
        )
    )

    resolved_language = (
        _detect_message_language(payload.message, user.language)
        if _is_auto_or_empty(payload.language)
        else payload.language
    )
    resolved_tone = (
        profile.tone if profile and _is_auto_or_empty(payload.tone) else _coalesce_value(payload.tone, "conversational")
    )
    resolved_vibe = (
        (profile.preferences or {}).get("personality") if profile and _is_auto_or_empty(payload.vibe) else str(payload.vibe or "").strip()
    )
    creator_memory = _build_creator_memory(profile, resolved_language, payload.message, recent_memories)
    chat_memory_record = _get_assistant_chat_memory(db, user.id, chat_id)
    chat_memory_payload = _parse_chat_memory_record(chat_memory_record)
    if chat_memory_payload and isinstance(chat_memory_payload.get("messages"), list):
        creator_memory["long_chat_memory"] = json.dumps(chat_memory_payload.get("messages", []))
    elif chat_id == "default":
        legacy_memory = _get_legacy_assistant_chat_memory(db, user.id)
        if legacy_memory and legacy_memory.memory_value:
            creator_memory["long_chat_memory"] = legacy_memory.memory_value
    app_context = _build_app_context(profile, user, db)

    try:
        response = httpx.post(
            f"{settings.ai_service_url.rstrip('/')}/assistant",
            json={
                "user_id": user.id,
                "message": payload.message,
                "language": resolved_language,
                "tone": resolved_tone,
                "vibe": resolved_vibe,
                "messages": _serialize_recent_messages(payload),
                "app_context": app_context,
                "creator_memory": creator_memory,
            },
            timeout=60.0,
        )
        response.raise_for_status()
        parsed_response = AIAssistantResponse(**response.json())
        _persist_assistant_chat_memory(
            db,
            user.id,
            chat_id,
            chat_memory_record,
            payload.message,
            _build_persisted_assistant_message(
                parsed_response.assistant_message,
                parsed_response.follow_up_question,
            ),
        )
        parsed_response.chat_id = chat_id
        return parsed_response
    except Exception:
        memory_facts = creator_memory.get("memory_facts", [])
        recent_posts = app_context.get("recent_posts", [])
        first_post = recent_posts[0]["title"] if recent_posts else None
        assistant_message = (
            f"I can help with your Xcr8 workspace in a {resolved_tone} way and keep the reply in {resolved_language}."
        )
        if resolved_vibe:
            assistant_message += f" I’m matching your vibe: {resolved_vibe}."
        assistant_message += (
            f" Right now I can see {app_context['summary']['drafts']} drafts, "
            f"{app_context['summary']['scheduled']} scheduled posts, and {app_context['summary']['published']} published posts."
        )
        if memory_facts:
            assistant_message += f" One thing I remember about you: {memory_facts[0]}."
        if first_post:
            assistant_message += f" Your latest post is {first_post}."

        fallback_response = AIAssistantResponse(
            chat_id=chat_id,
            assistant_message=assistant_message,
            follow_up_question="What should I help you figure out next?",
            suggested_actions=["Summarize my dashboard", "Review my latest post", "Help me plan content"],
            language=resolved_language,
            tone=resolved_tone,
            model="backend-local-assistant-fallback",
            prompt_template_version="assistant-v1",
            latency_ms=0,
            usage={"prompt_tokens": None, "completion_tokens": None, "total_tokens": None},
        )
        _persist_assistant_chat_memory(
            db,
            user.id,
            chat_id,
            chat_memory_record,
            payload.message,
            _build_persisted_assistant_message(
                fallback_response.assistant_message,
                fallback_response.follow_up_question,
            ),
        )
        return fallback_response


@router.post("/assistant/chats/{user_id}", response_model=AIAssistantChatSummary)
def create_assistant_chat(
    user_id: int,
    payload: AIAssistantChatCreateRequest,
    email: str | None = None,
    db: Session = Depends(get_db),
) -> AIAssistantChatSummary:
    user = _resolve_user_by_identity(db, user_id, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    chat_id = _normalize_chat_id(payload.chat_id) if payload.chat_id else _generate_chat_id()
    now = datetime.now(tz=UTC)
    title = _compact_text(payload.title or "New chat", 56) or "New chat"
    stored = _build_chat_payload(chat_id, title, [], now.isoformat())
    _save_chat_payload(db, user.id, chat_id, stored)

    return AIAssistantChatSummary(
        chat_id=chat_id,
        title=title,
        preview="Start a fresh conversation with Cr8or AI.",
        updated_at=now.isoformat(),
    )


@router.patch("/assistant/chats/{user_id}/{chat_id}", response_model=AIAssistantChatSummary)
def rename_assistant_chat(
    user_id: int,
    chat_id: str,
    payload: AIAssistantChatCreateRequest,
    email: str | None = None,
    db: Session = Depends(get_db),
) -> AIAssistantChatSummary:
    user = _resolve_user_by_identity(db, user_id, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    normalized_chat_id = _normalize_chat_id(chat_id)
    record = _get_assistant_chat_memory(db, user.id, normalized_chat_id)
    if not record:
        raise HTTPException(status_code=404, detail="Chat not found")

    stored_payload = _parse_chat_memory_record(record) or {
        "chat_id": normalized_chat_id,
        "updated_at": datetime.now(tz=UTC).isoformat(),
        "messages": [],
    }
    stored_payload["chat_id"] = normalized_chat_id
    stored_payload["title"] = _compact_text(payload.title or stored_payload.get("title") or "New chat", 56)
    record.memory_value = json.dumps(stored_payload)
    record.last_used_at = datetime.now(tz=UTC)
    db.add(record)
    db.commit()
    db.refresh(record)

    preview_source = next(
        (
            str(message.get("content") or "").strip()
            for message in reversed(stored_payload.get("messages", []))
            if str(message.get("content") or "").strip()
        ),
        "",
    )

    return AIAssistantChatSummary(
        chat_id=normalized_chat_id,
        title=str(stored_payload.get("title") or "New chat"),
        preview=_compact_text(preview_source or "Cr8or AI chat", 90),
        updated_at=str(stored_payload.get("updated_at") or record.last_used_at or record.created_at),
    )


@router.delete("/assistant/chats/{user_id}/{chat_id}")
def delete_assistant_chat(
    user_id: int,
    chat_id: str,
    email: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    user = _resolve_user_by_identity(db, user_id, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    normalized_chat_id = _normalize_chat_id(chat_id)
    record = _get_assistant_chat_memory(db, user.id, normalized_chat_id)
    if not record:
        raise HTTPException(status_code=404, detail="Chat not found")

    db.delete(record)
    db.commit()
    return {"message": "Chat deleted"}


@router.get("/assistant/chats/{user_id}", response_model=list[AIAssistantChatSummary])
def list_assistant_chats(user_id: int, email: str | None = None, db: Session = Depends(get_db)) -> list[AIAssistantChatSummary]:
    user = _resolve_user_by_identity(db, user_id, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    chat_records = list(
        db.scalars(
            select(CreatorMemory)
            .where(
                CreatorMemory.user_id == user.id,
                CreatorMemory.memory_type == ASSISTANT_CHAT_MEMORY_TYPE,
                CreatorMemory.memory_key.like(f"{ASSISTANT_CHAT_MEMORY_PREFIX}%"),
            )
            .order_by(desc(CreatorMemory.last_used_at), desc(CreatorMemory.created_at))
        )
    )

    summaries: list[AIAssistantChatSummary] = []
    for record in chat_records:
        payload = _parse_chat_memory_record(record)
        if not payload:
            continue

        messages = payload.get("messages") if isinstance(payload.get("messages"), list) else []
        preview_source = next(
            (
                str(message.get("content") or "").strip()
                for message in reversed(messages)
                if str(message.get("content") or "").strip()
            ),
            "",
        )
        summaries.append(
            AIAssistantChatSummary(
                chat_id=str(payload.get("chat_id") or record.memory_key.replace(ASSISTANT_CHAT_MEMORY_PREFIX, "", 1)),
                title=str(payload.get("title") or _build_chat_title(messages)),
                preview=_compact_text(preview_source or "Cr8or AI chat", 90),
                updated_at=str(payload.get("updated_at") or record.last_used_at or record.created_at),
            )
        )

    if not any(summary.chat_id == "default" for summary in summaries):
        legacy_memory = _get_legacy_assistant_chat_memory(db, user.id)
        legacy_summary = _build_legacy_chat_summary(legacy_memory) if legacy_memory else None
        if legacy_summary:
            summaries.append(legacy_summary)

    return summaries


@router.get("/assistant/chats/{user_id}/{chat_id}", response_model=AIAssistantChatHistory)
def get_assistant_chat_history(
    user_id: int,
    chat_id: str,
    email: str | None = None,
    db: Session = Depends(get_db),
) -> AIAssistantChatHistory:
    user = _resolve_user_by_identity(db, user_id, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    normalized_chat_id = _normalize_chat_id(chat_id)
    chat_record = _get_assistant_chat_memory(db, user.id, normalized_chat_id)
    if not chat_record and normalized_chat_id == "default":
        legacy_memory = _get_legacy_assistant_chat_memory(db, user.id)
        if legacy_memory:
            return AIAssistantChatHistory(
                chat_id="default",
                title="Earlier Cr8or AI chat",
                updated_at=str(legacy_memory.last_used_at or legacy_memory.created_at),
                messages=[
                    {
                        "role": "assistant",
                        "content": _compact_text(legacy_memory.memory_value, 6000),
                    }
                ],
            )

    if not chat_record:
        return AIAssistantChatHistory(
            chat_id=normalized_chat_id,
            title="New chat",
            updated_at=datetime.now(tz=UTC).isoformat(),
            messages=[],
        )

    return _build_chat_history_response(chat_record, normalized_chat_id)