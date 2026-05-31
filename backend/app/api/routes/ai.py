from __future__ import annotations

from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import (
    AIGeneration,
    ConnectedPlatform,
    ContentPost,
    CreatorMemory,
    CreatorProfile,
    PostStatus,
    User,
)
from app.schemas.mvp import (
    AIAssistantRequest,
    AIAssistantResponse,
    AIBrainstormRequest,
    AIBrainstormResponse,
    AIComposeRequest,
    AIComposeResponse,
)
from app.services.ai_adapter import generate_composed_content, generate_content_ideas

router = APIRouter(prefix="/ai", tags=["ai"])


def _coalesce_value(value: str | None, fallback: str) -> str:
    cleaned = str(value or "").strip()
    return cleaned or fallback


def _is_auto_or_empty(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"", "auto"}


def _build_missing_user_assistant_response(payload: AIAssistantRequest) -> AIAssistantResponse:
    resolved_language = "english" if _is_auto_or_empty(payload.language) else payload.language
    resolved_tone = "conversational" if _is_auto_or_empty(payload.tone) else payload.tone

    return AIAssistantResponse(
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


def _build_creator_memory(
    profile: CreatorProfile | None,
    payload_language: str,
    prompt_seed: str,
    recent_memories: list[CreatorMemory],
) -> dict:
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
        "personality": (profile.preferences or {}).get("personality") if profile else None,
        "audience_location": (profile.preferences or {}).get("audience_location") if profile else None,
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
    user = db.get(User, payload.user_id)
    if not user:
        return _build_missing_user_assistant_response(payload)

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

    resolved_language = user.language if _is_auto_or_empty(payload.language) else payload.language
    resolved_tone = (
        profile.tone if profile and _is_auto_or_empty(payload.tone) else _coalesce_value(payload.tone, "conversational")
    )
    resolved_vibe = (
        (profile.preferences or {}).get("personality") if profile and _is_auto_or_empty(payload.vibe) else str(payload.vibe or "").strip()
    )
    creator_memory = _build_creator_memory(profile, resolved_language, payload.message, recent_memories)
    app_context = _build_assistant_context(db, user, profile)

    try:
        response = httpx.post(
            f"{settings.ai_service_url.rstrip('/')}/assistant",
            json={
                "user_id": payload.user_id,
                "message": payload.message,
                "language": resolved_language,
                "tone": resolved_tone,
                "vibe": resolved_vibe,
                "messages": [message.model_dump() for message in payload.messages],
                "app_context": app_context,
                "creator_memory": creator_memory,
            },
            timeout=60.0,
        )
        response.raise_for_status()
        return AIAssistantResponse(**response.json())
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

        return AIAssistantResponse(
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