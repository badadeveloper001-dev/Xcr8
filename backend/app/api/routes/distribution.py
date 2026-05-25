from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import AIGeneration, ContentPost, CreatorProfile, Platform, PostStatus, PostVariant, User
from app.schemas.mvp import ApprovalRequest, DistributionCreateRequest, DistributionDraftResponse
from app.services.ai_adapter import generate_adaptation

router = APIRouter(prefix="/distribution", tags=["distribution"])


@router.post("/draft", response_model=DistributionDraftResponse)
def create_distribution_draft(
    payload: DistributionCreateRequest,
    db: Session = Depends(get_db),
) -> DistributionDraftResponse:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    post = ContentPost(
        user_id=payload.user_id,
        title=payload.title,
        media_url=payload.media_url,
        media_type=payload.media_type,
        master_caption=payload.master_caption,
        primary_language=payload.primary_language,
        selected_platforms=payload.selected_platforms,
        status=PostStatus.draft,
        content_meta={"target_languages": payload.target_languages},
    )
    db.add(post)
    db.flush()

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == payload.user_id))
    creator_memory = {
        "tone": profile.tone if profile else "confident",
        "emoji_style": profile.emoji_style if profile else "🔥",
        "slang_profile": profile.slang_profile if profile else "light",
        "multilingual_profile": profile.multilingual_profile if profile else [payload.primary_language],
    }

    variants: list[PostVariant] = []
    for platform in payload.selected_platforms:
        for language in payload.target_languages:
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
