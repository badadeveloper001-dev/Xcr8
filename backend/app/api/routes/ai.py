from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import CreatorMemory, CreatorProfile, User
from app.schemas.mvp import AIBrainstormRequest, AIBrainstormResponse, AIComposeRequest, AIComposeResponse
from app.services.ai_adapter import generate_composed_content, generate_content_ideas

router = APIRouter(prefix="/ai", tags=["ai"])


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

    memory_facts = [
        f"{memory.memory_key}: {memory.memory_value}"
        for memory in recent_memories
        if memory.memory_key and memory.memory_value
    ]

    creator_memory = {
        "tone": payload.tone or (profile.tone if profile else "conversational"),
        "emoji_style": profile.emoji_style if profile else "🔥",
        "slang_profile": profile.slang_profile if profile else "light",
        "niche": profile.niche if profile else payload.topic,
        "preferred_caption_length": profile.preferred_caption_length if profile else 120,
        "personality": (profile.preferences or {}).get("personality") if profile else None,
        "audience_location": payload.audience_location
        or ((profile.preferences or {}).get("audience_location") if profile else None),
        "multilingual_profile": profile.multilingual_profile if profile else [payload.language],
        "memory_facts": memory_facts,
    }

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

    memory_facts = [
        f"{memory.memory_key}: {memory.memory_value}"
        for memory in recent_memories
        if memory.memory_key and memory.memory_value
    ]

    creator_memory = {
        "tone": payload.tone or (profile.tone if profile else "conversational"),
        "emoji_style": profile.emoji_style if profile else "🔥",
        "slang_profile": profile.slang_profile if profile else "light",
        "niche": profile.niche if profile else payload.prompt,
        "preferred_caption_length": profile.preferred_caption_length if profile else 120,
        "personality": (profile.preferences or {}).get("personality") if profile else None,
        "audience_location": payload.audience_location
        or ((profile.preferences or {}).get("audience_location") if profile else None),
        "multilingual_profile": profile.multilingual_profile if profile else [payload.language],
        "memory_facts": memory_facts,
    }

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