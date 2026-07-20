from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import (
    AIGeneration,
    ContentPost,
    CreatorMemory,
    CreatorProfile,
    Platform,
    PostStatus,
    PostVariant,
    User,
)
from app.schemas.mvp import ApprovalRequest, DistributionCreateRequest, DistributionDraftResponse
from app.services.ai_adapter import detect_caption_language, generate_adaptation

router = APIRouter(prefix="/distribution", tags=["distribution"])


@router.post("/draft", response_model=DistributionDraftResponse)
def create_distribution_draft(
    payload: DistributionCreateRequest,
    db: Session = Depends(get_db),
) -> DistributionDraftResponse:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    language_detection = detect_caption_language(payload.master_caption)
    detected_language = str(language_detection.get("language", "english"))

    post = ContentPost(
        user_id=payload.user_id,
        title=payload.title,
        media_url=payload.media_url,
        media_type=payload.media_type,
        master_caption=payload.master_caption,
        primary_language=detected_language,
        selected_platforms=payload.selected_platforms,
        status=PostStatus.draft,
        content_meta={
            "target_languages": [detected_language],
            "detected_language": detected_language,
            "language_detection": language_detection,
            "media_urls": payload.media_urls or [payload.media_url],
            "media_types": payload.media_types or [payload.media_type],
        },
    )
    db.add(post)
    db.flush()

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
        "tone": profile.tone if profile else "confident",
        "emoji_style": profile.emoji_style if profile else "🔥",
        "slang_profile": profile.slang_profile if profile else "light",
        "niche": profile.niche if profile else "creator",
        "preferred_caption_length": profile.preferred_caption_length if profile else 120,
        "personality": (profile.preferences or {}).get("personality") if profile else None,
        "audience_location": (profile.preferences or {}).get("audience_location") if profile else None,
        "multilingual_profile": profile.multilingual_profile if profile else [detected_language],
        "memory_facts": memory_facts,
        "language_profile": {
            "primary": detected_language,
            "secondary": language_detection.get("secondary_language"),
            "is_mixed": bool(language_detection.get("is_mixed")),
            "segments": language_detection.get("segments", []),
        },
    }

    now = datetime.utcnow()
    for memory in recent_memories:
        memory.last_used_at = now

    variants: list[PostVariant] = []
    target_languages = [detected_language]
    for platform in payload.selected_platforms:
        for language in target_languages:
            result = generate_adaptation(
                text=payload.master_caption,
                platform=platform,
                language=language,
                creator_memory=creator_memory,
            )

            variant = PostVariant(
                post_id=post.id,
                platform=Platform(platform),
                language=language,
                adapted_caption=result.get("adapted_caption", payload.master_caption),
                hashtags=result.get("hashtags", []),
                hook=result.get("hook", ""),
            )
            db.add(variant)
            variants.append(variant)

            generation = AIGeneration(
                post_id=post.id,
                model_name=result.get("model", "gpt-4o-mini"),
                input_payload={
                    "master_caption": payload.master_caption,
                    "platform": platform,
                    "language": language,
                    "creator_memory": creator_memory,
                },
                output_payload=result,
            )
            db.add(generation)

    db.commit()

    return DistributionDraftResponse(
        post_id=post.id,
        status=post.status.value,
        variants=[
            {
                "platform": variant.platform.value,
                "language": variant.language,
                "adapted_caption": variant.adapted_caption,
                "hashtags": variant.hashtags,
                "hook": variant.hook,
                "approved": variant.approved,
            }
            for variant in variants
        ],
    )


@router.post("/approve")
def approve_variants(payload: ApprovalRequest, db: Session = Depends(get_db)) -> dict:
    post = db.get(ContentPost, payload.post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    approved_count = 0
    for approval in payload.approvals:
        platform = approval.get("platform")
        language = approval.get("language")
        approved = bool(approval.get("approved"))

        variant = db.scalar(
            select(PostVariant).where(
                PostVariant.post_id == post.id,
                PostVariant.platform == Platform(platform),
                PostVariant.language == language,
            )
        )
        if not variant:
            continue

        variant.approved = approved
        variant.approved_at = datetime.utcnow() if approved else None
        if approved:
            approved_count += 1

    post.status = PostStatus.approved if approved_count else PostStatus.draft
    db.commit()

    return {
        "post_id": post.id,
        "approved_count": approved_count,
        "status": post.status.value,
    }
