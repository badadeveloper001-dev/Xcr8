from datetime import UTC, datetime, timedelta
import base64
import hashlib
import hmac
import secrets
import re

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
from app.services.auth import (
    supabase_request_password_reset,
    supabase_sign_in,
    supabase_sign_up,
    supabase_update_password,
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


def _safe_username_seed(value: str) -> str:
    seed = re.sub(r"[^a-zA-Z0-9_.-]", "", value.strip().lower())
    if not seed:
        seed = "creator"
    return seed[:32]


def _ensure_unique_username(db: Session, base: str) -> str:
    candidate = _safe_username_seed(base)
    suffix = 0
    while True:
        username = candidate if suffix == 0 else f"{candidate[:28]}{suffix:04d}"
        existing = db.scalar(select(AuthCredential).where(AuthCredential.username == username))
        if not existing:
            return username
        suffix += 1


@router.post("/signup", response_model=AuthSessionResponse)
def signup(payload: AuthSignupRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")

    if len(payload.password) < 8 or not any(ch.isdigit() for ch in payload.password):
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters and include a number.")

    try:
        supabase_sign_up(
            email=payload.email,
            password=payload.password,
            metadata={"full_name": payload.full_name, "username": payload.username},
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 409 if "already" in message.lower() else 400
        raise HTTPException(status_code=status_code, detail=message) from exc

    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == existing.id))
        desired_username = payload.username
        if credential and credential.username != desired_username:
            username_taken = db.scalar(select(AuthCredential).where(AuthCredential.username == desired_username))
            if username_taken and username_taken.user_id != existing.id:
                desired_username = _ensure_unique_username(db, desired_username)
        salt, password_hash = _hash_password(payload.password)
        if credential:
            credential.username = desired_username
            credential.full_name = payload.full_name
            credential.password_salt = salt
            credential.password_hash = password_hash
            credential.remember_me_default = True
        else:
            db.add(
                AuthCredential(
                    user_id=existing.id,
                    username=desired_username,
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
        local_username = _ensure_unique_username(db, payload.username)
    else:
        local_username = payload.username

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
            username=local_username,
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
    try:
        auth_payload = supabase_sign_in(payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    user = db.scalar(select(User).where(User.email == payload.email))
    if not user:
        auth_user = auth_payload.get("user") if isinstance(auth_payload, dict) else {}
        user_meta = auth_user.get("user_metadata") if isinstance(auth_user, dict) else {}
        display_name = payload.email.split("@")[0]
        if isinstance(user_meta, dict):
            display_name = str(user_meta.get("full_name") or display_name)

        user = User(
            email=payload.email,
            display_name=display_name,
        )
        db.add(user)
        db.flush()

        username_seed = payload.email.split("@")[0]
        if isinstance(user_meta, dict):
            username_seed = str(user_meta.get("username") or username_seed)

        placeholder_salt, placeholder_hash = _hash_password(secrets.token_urlsafe(16))
        db.add(
            AuthCredential(
                user_id=user.id,
                username=_ensure_unique_username(db, username_seed),
                full_name=display_name,
                password_salt=placeholder_salt,
                password_hash=placeholder_hash,
                remember_me_default=payload.remember_me,
            )
        )

        profile = CreatorProfile(
            user_id=user.id,
            multilingual_profile=[user.language],
        )
        db.add(profile)

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    if not credential:
        placeholder_salt, placeholder_hash = _hash_password(secrets.token_urlsafe(16))
        credential = AuthCredential(
            user_id=user.id,
            username=_ensure_unique_username(db, payload.email.split("@")[0]),
            full_name=user.display_name,
            password_salt=placeholder_salt,
            password_hash=placeholder_hash,
            remember_me_default=payload.remember_me,
        )
        db.add(credential)

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
    try:
        supabase_request_password_reset(payload.email)
    except ValueError:
        # Keep response generic for security and compatibility.
        pass

    return PasswordResetRequestResponse(
        message="If the email exists, a reset link has been sent.",
        reset_url=None,
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

    try:
        supabase_update_password(payload.token, payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"message": "Password reset successful. You can now log in."}


@router.get("/supabase-config")
def supabase_config() -> dict[str, str | bool]:
    return {
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_anon_key,
        "google_oauth_enabled": settings.google_oauth_enabled,
    }
