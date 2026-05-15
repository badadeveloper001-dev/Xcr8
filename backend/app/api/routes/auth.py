from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import CreatorProfile, User
from app.schemas.mvp import AuthSessionResponse, AuthSignupRequest, OnboardingRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=AuthSessionResponse)
def signup(payload: AuthSignupRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        return AuthSessionResponse(
            user_id=existing.id,
            email=existing.email,
            display_name=existing.display_name,
            onboarding_complete=existing.onboarding_complete,
            google_oauth_enabled=settings.google_oauth_enabled,
        )

    user = User(
        email=payload.email,
        display_name=payload.display_name,
        language=payload.language,
        timezone=payload.timezone,
    )
    db.add(user)
    db.flush()

    profile = CreatorProfile(
        user_id=user.id,
        multilingual_profile=[payload.language],
    )
    db.add(profile)
    db.commit()
    db.refresh(user)

    return AuthSessionResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        onboarding_complete=user.onboarding_complete,
        google_oauth_enabled=settings.google_oauth_enabled,
    )


@router.get("/session/{user_id}", response_model=AuthSessionResponse)
def get_session(user_id: int, db: Session = Depends(get_db)) -> AuthSessionResponse:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return AuthSessionResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        onboarding_complete=user.onboarding_complete,
        google_oauth_enabled=settings.google_oauth_enabled,
    )


@router.post("/onboarding", response_model=AuthSessionResponse)
def onboarding(payload: OnboardingRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    if not profile:
        profile = CreatorProfile(user_id=user.id)
        db.add(profile)

    profile.niche = payload.niche
    profile.tone = payload.tone
    profile.emoji_style = payload.emoji_style
    profile.slang_profile = payload.slang_profile
    profile.multilingual_profile = payload.multilingual_profile
    user.onboarding_complete = True

    db.commit()
    db.refresh(user)

    return AuthSessionResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        onboarding_complete=user.onboarding_complete,
        google_oauth_enabled=settings.google_oauth_enabled,
    )


@router.get("/supabase-config")
def supabase_config() -> dict[str, str | bool]:
    return {
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_anon_key,
        "google_oauth_enabled": settings.google_oauth_enabled,
    }
