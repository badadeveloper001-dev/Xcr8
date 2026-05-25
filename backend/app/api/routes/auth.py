from datetime import UTC, datetime, timedelta
import base64
import hashlib
import hmac
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import AuthCredential, CreatorProfile, User
from app.schemas.mvp import (
    AuthLoginRequest,
    AuthSessionResponse,
    PasswordResetConfirmRequest,
    AuthSignupRequest,
    OnboardingRequest,
    PasswordResetRequest,
    PasswordResetRequestResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    salt_bytes = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 120_000)
    return base64.b64encode(salt_bytes).decode("ascii"), base64.b64encode(digest).decode("ascii")


def _verify_password(password: str, salt_value: str, hash_value: str) -> bool:
    salt_bytes = base64.b64decode(salt_value.encode("ascii"))
    _, computed_hash = _hash_password(password, salt_bytes)
    return hmac.compare_digest(computed_hash, hash_value)


def _session_payload(user: User, credential: AuthCredential | None = None) -> AuthSessionResponse:
    return AuthSessionResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        full_name=credential.full_name if credential else user.display_name,
        username=credential.username if credential else None,
        onboarding_complete=user.onboarding_complete,
        google_oauth_enabled=settings.google_oauth_enabled,
    )


@router.post("/signup", response_model=AuthSessionResponse)
def signup(payload: AuthSignupRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")

    if len(payload.password) < 8 or not any(ch.isdigit() for ch in payload.password):
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters and include a number.")

    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == existing.id))
        if credential and credential.username != payload.username:
            username_taken = db.scalar(select(AuthCredential).where(AuthCredential.username == payload.username))
            if username_taken and username_taken.user_id != existing.id:
                raise HTTPException(status_code=409, detail="Username is already taken.")
        salt, password_hash = _hash_password(payload.password)
        if credential:
            credential.username = payload.username
            credential.full_name = payload.full_name
            credential.password_salt = salt
            credential.password_hash = password_hash
            credential.remember_me_default = True
        else:
            db.add(
                AuthCredential(
                    user_id=existing.id,
                    username=payload.username,
                    full_name=payload.full_name,
                    password_salt=salt,
                    password_hash=password_hash,
                    remember_me_default=True,
                )
            )
        existing.display_name = payload.full_name
        existing.language = payload.language
        existing.timezone = payload.timezone
        db.commit()
        db.refresh(existing)
        credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == existing.id))
        return _session_payload(existing, credential)

    username_taken = db.scalar(select(AuthCredential).where(AuthCredential.username == payload.username))
    if username_taken:
        raise HTTPException(status_code=409, detail="Username is already taken.")

    user = User(
        email=payload.email,
        display_name=payload.full_name,
        language=payload.language,
        timezone=payload.timezone,
    )
    db.add(user)
    db.flush()

    salt, password_hash = _hash_password(payload.password)
    db.add(
        AuthCredential(
            user_id=user.id,
            username=payload.username,
            full_name=payload.full_name,
            password_salt=salt,
            password_hash=password_hash,
            remember_me_default=True,
        )
    )

    profile = CreatorProfile(
        user_id=user.id,
        multilingual_profile=[payload.language],
    )
    db.add(profile)
    db.commit()
    db.refresh(user)

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    return _session_payload(user, credential)


@router.post("/login", response_model=AuthSessionResponse)
def login(payload: AuthLoginRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    if not credential or not _verify_password(payload.password, credential.password_salt, credential.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    credential.remember_me_default = payload.remember_me
    db.commit()
    db.refresh(user)
    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    return _session_payload(user, credential)


@router.get("/session/{user_id}", response_model=AuthSessionResponse)
def get_session(user_id: int, db: Session = Depends(get_db)) -> AuthSessionResponse:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    return _session_payload(user, credential)


@router.post("/onboarding", response_model=AuthSessionResponse)
def onboarding(payload: OnboardingRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    if not profile:
        profile = CreatorProfile(user_id=user.id)
        db.add(profile)

    profile.niche = payload.content_niche
    profile.tone = payload.tone
    profile.preferences = {
        **(profile.preferences or {}),
        "creator_type": payload.creator_type,
        "platforms_used": payload.platforms_used,
        "audience_location": payload.audience_location,
        "content_goals": payload.content_goals,
        "posting_frequency": payload.posting_frequency,
        "personality": payload.personality,
        "initialized_at": datetime.now(tz=UTC).isoformat(),
    }
    user.onboarding_complete = True

    db.commit()
    db.refresh(user)

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    return _session_payload(user, credential)


@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
def request_password_reset(
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
) -> PasswordResetRequestResponse:
    reset_url: str | None = None

    user = db.scalar(select(User).where(User.email == payload.email))
    if user:
        credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
        if credential:
            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
            credential.password_reset_token_hash = token_hash
            credential.password_reset_expires_at = datetime.now(tz=UTC) + timedelta(hours=1)
            db.commit()

            if settings.environment == "development":
                reset_url = f"/auth/reset-password?token={raw_token}"

    return PasswordResetRequestResponse(
        message="If the email exists, a reset link has been sent.",
        reset_url=reset_url,
    )


@router.post("/password-reset/confirm")
def confirm_password_reset(
    payload: PasswordResetConfirmRequest,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")

    if len(payload.new_password) < 8 or not any(ch.isdigit() for ch in payload.new_password):
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters and include a number.")

    token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    credential = db.scalar(
        select(AuthCredential).where(AuthCredential.password_reset_token_hash == token_hash)
    )
    if not credential:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    if not credential.password_reset_expires_at or credential.password_reset_expires_at < datetime.now(tz=UTC):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    salt, password_hash = _hash_password(payload.new_password)
    credential.password_salt = salt
    credential.password_hash = password_hash
    credential.password_reset_token_hash = None
    credential.password_reset_expires_at = None
    db.commit()

    return {"message": "Password reset successful. You can now log in."}


@router.get("/supabase-config")
def supabase_config() -> dict[str, str | bool]:
    return {
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_anon_key,
        "google_oauth_enabled": settings.google_oauth_enabled,
    }
