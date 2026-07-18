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
from app.db.models import AuthCredential, CreatorMemory, CreatorProfile, User
from app.schemas.mvp import (
    AvatarUpdateRequest,
    AuthGoogleTokenRequest,
    AuthProfileUpdateRequest,
    AuthLoginRequest,
    AuthSignupLinkVerifyRequest,
    AuthSignupPasswordVerifyRequest,
    AuthSessionResponse,
    AuthSignupCodeVerifyRequest,
    PasswordResetConfirmRequest,
    AuthSignupRequest,
    OnboardingRequest,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    SignupResponse,
)
from app.services.auth import (
    SupabaseAuthError,
    stable_fallback_user_id,
    supabase_mark_onboarding_complete,
    supabase_request_password_reset,
    supabase_admin_confirm_email,
    supabase_get_user,
    supabase_sign_in,
    supabase_update_password,
    supabase_verify_email_link,
    generate_signup_email_code,
    hash_signup_email_code,
    send_signup_email_code,
    signup_code_expiry,
    verify_signup_email_code,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _is_auth_rate_limited(message: str, status_code: int) -> bool:
    lowered = message.lower()
    return status_code == 429 or "rate limit" in lowered or "too many" in lowered


def _hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    salt_bytes = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 120_000)
    return base64.b64encode(salt_bytes).decode("ascii"), base64.b64encode(digest).decode("ascii")


def _verify_password(password: str, salt_value: str, hash_value: str) -> bool:
    salt_bytes = base64.b64decode(salt_value.encode("ascii"))
    _, computed_hash = _hash_password(password, salt_bytes)
    return hmac.compare_digest(computed_hash, hash_value)


def _session_payload(
    user: User,
    credential: AuthCredential | None = None,
    profile: CreatorProfile | None = None,
) -> AuthSessionResponse:
    resolved_profile = profile or user.profile
    preferences = (
        resolved_profile.preferences
        if resolved_profile and isinstance(resolved_profile.preferences, dict)
        else {}
    )
    return AuthSessionResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        full_name=credential.full_name if credential else user.display_name,
        username=credential.username if credential else None,
        avatar_url=str(preferences.get("avatar_url") or "").strip() or None,
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


def _extract_onboarding_state(user_meta: dict | None) -> tuple[bool, bool]:
    if not isinstance(user_meta, dict):
        return False, True

    if "onboarding_complete" not in user_meta:
        # Older accounts may not have this metadata; default to complete to avoid onboarding loops.
        return False, True

    return True, bool(user_meta.get("onboarding_complete"))


def _normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def _first_or_default(values: list[str], fallback: str) -> str:
    for item in values:
        candidate = str(item).strip()
        if candidate:
            return candidate
    return fallback


def _is_email_code_verified(profile: CreatorProfile | None) -> bool:
    if not profile:
        return True

    preferences = profile.preferences if isinstance(profile.preferences, dict) else {}
    if "email_code_verified" not in preferences:
        return True
    return bool(preferences.get("email_code_verified"))


def _compact_list(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in values:
        value = str(item or "").strip()
        key = value.lower()
        if value and key not in seen:
            normalized.append(value)
            seen.add(key)
    return normalized


def _upsert_creator_memory(
    db: Session,
    user_id: int,
    memory_key: str,
    memory_value: str,
    confidence_score: float = 0.92,
) -> None:
    existing = db.scalar(
        select(CreatorMemory).where(
            CreatorMemory.user_id == user_id,
            CreatorMemory.memory_type == "onboarding",
            CreatorMemory.memory_key == memory_key,
        )
    )

    target = existing or CreatorMemory(
        user_id=user_id,
        memory_type="onboarding",
        memory_key=memory_key,
        memory_value="",
    )
    target.memory_value = memory_value
    target.confidence_score = confidence_score
    target.last_used_at = datetime.now(tz=UTC)
    db.add(target)


@router.post("/signup/request-code", response_model=SignupResponse)
def signup_request_code(payload: AuthSignupRequest, db: Session = Depends(get_db)) -> SignupResponse:
    normalized_email = _normalize_email(str(payload.email))

    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")

    if len(payload.password) < 8 or not any(ch.isdigit() for ch in payload.password):
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters and include a number.")

    existing = db.scalar(select(User).where(User.email == normalized_email))
    if existing:
        credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == existing.id))
        profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == existing.id))

        if _is_email_code_verified(profile):
            raise HTTPException(status_code=409, detail="Account already exists. Please log in.")

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
        if profile:
            profile.preferences = {
                **(profile.preferences or {}),
                "email_code_verified": False,
                "email_verification_method": "pending",
            }
            code = generate_signup_email_code()
            profile.preferences = {
                **profile.preferences,
                "signup_code_hash": hash_signup_email_code(normalized_email, code),
                "signup_code_expires_at": signup_code_expiry().isoformat(),
                "signup_code_attempts": 0,
                "signup_code_sent_at": datetime.now(tz=UTC).isoformat(),
            }
        else:
            code = generate_signup_email_code()
            profile = CreatorProfile(
                user_id=existing.id,
                multilingual_profile=[payload.language],
                preferences={
                    "email_code_verified": False,
                    "email_verification_method": "pending",
                    "signup_code_hash": hash_signup_email_code(normalized_email, code),
                    "signup_code_expires_at": signup_code_expiry().isoformat(),
                    "signup_code_attempts": 0,
                    "signup_code_sent_at": datetime.now(tz=UTC).isoformat(),
                },
            )
            db.add(profile)
        db.commit()
        try:
            send_signup_email_code(normalized_email, code)
        except SupabaseAuthError as exc:
            raise HTTPException(status_code=max(400, min(exc.status_code, 499)), detail=str(exc)) from exc
        message = "Verification code sent to your email."
        return {"message": message}

    username_taken = db.scalar(select(AuthCredential).where(AuthCredential.username == payload.username))
    if username_taken:
        local_username = _ensure_unique_username(db, payload.username)
    else:
        local_username = payload.username

    user = User(
        email=normalized_email,
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
        preferences={
            "email_code_verified": False,
            "email_verification_method": "pending",
        },
    )
    code = generate_signup_email_code()
    profile.preferences = {
        **(profile.preferences or {}),
        "signup_code_hash": hash_signup_email_code(normalized_email, code),
        "signup_code_expires_at": signup_code_expiry().isoformat(),
        "signup_code_attempts": 0,
        "signup_code_sent_at": datetime.now(tz=UTC).isoformat(),
    }
    db.add(profile)
    db.commit()
    try:
        send_signup_email_code(normalized_email, code)
    except SupabaseAuthError as exc:
        raise HTTPException(status_code=max(400, min(exc.status_code, 499)), detail=str(exc)) from exc
    message = "Verification code sent to your email."
    return SignupResponse(
        message=message,
        requires_verification=True,
    )


@router.post("/signup/verify-code", response_model=AuthSessionResponse)
def signup_verify_code(payload: AuthSignupCodeVerifyRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    normalized_email = _normalize_email(str(payload.email))

    user = db.scalar(select(User).where(User.email == normalized_email))
    if not user:
        raise HTTPException(status_code=404, detail="Signup session not found. Please register again.")

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    if not profile:
        raise HTTPException(status_code=404, detail="Signup session not found. Please register again.")

    preferences = profile.preferences if isinstance(profile.preferences, dict) else {}
    stored_hash = str(preferences.get("signup_code_hash") or "").strip()
    expires_at_raw = str(preferences.get("signup_code_expires_at") or "").strip()
    attempts = int(preferences.get("signup_code_attempts") or 0)

    if not stored_hash or not expires_at_raw:
        raise HTTPException(status_code=400, detail="No active verification code. Please request a new code.")

    try:
        expires_at = datetime.fromisoformat(expires_at_raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Verification code expired. Request a new code.") from exc

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)

    if datetime.now(tz=UTC) > expires_at:
        raise HTTPException(status_code=400, detail="Verification code expired. Request a new code.")

    if attempts >= 8:
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new verification code.")

    if not verify_signup_email_code(normalized_email, str(payload.code).strip(), stored_hash):
        profile.preferences = {
            **preferences,
            "signup_code_attempts": attempts + 1,
        }
        db.add(profile)
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    profile.preferences = {
        **preferences,
        "email_code_verified": True,
        "email_verified_at": datetime.now(tz=UTC).isoformat(),
        "email_verification_method": "smtp_code",
        "signup_code_hash": None,
        "signup_code_expires_at": None,
        "signup_code_attempts": 0,
    }
    db.add(profile)
    db.commit()

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    return _session_payload(user, credential)


@router.post("/signup/verify-link", response_model=AuthSessionResponse)
def signup_verify_link(payload: AuthSignupLinkVerifyRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    normalized_email = _normalize_email(str(payload.email))

    try:
        supabase_verify_email_link(str(payload.token_hash).strip(), str(payload.type).strip().lower())
    except SupabaseAuthError as exc:
        if _is_auth_rate_limited(str(exc), exc.status_code):
            raise HTTPException(
                status_code=429,
                detail="Too many verification attempts. Please wait a minute and try again.",
            ) from exc
        raise HTTPException(status_code=max(400, min(exc.status_code, 499)), detail=str(exc)) from exc

    user = db.scalar(select(User).where(User.email == normalized_email))
    if not user:
        raise HTTPException(status_code=404, detail="Signup session not found. Please register again.")

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    if profile:
        profile.preferences = {
            **(profile.preferences or {}),
            "email_code_verified": True,
            "email_verified_at": datetime.now(tz=UTC).isoformat(),
            "email_verification_method": "link",
        }
        db.add(profile)
        db.commit()

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    return _session_payload(user, credential)


@router.post("/signup/verify-password", response_model=AuthSessionResponse)
def signup_verify_password(
    payload: AuthSignupPasswordVerifyRequest,
    db: Session = Depends(get_db),
) -> AuthSessionResponse:
    normalized_email = _normalize_email(str(payload.email))

    user = db.scalar(select(User).where(User.email == normalized_email))
    if not user:
        raise HTTPException(status_code=404, detail="Signup session not found. Please register again.")

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    if not credential or not _verify_password(payload.password, credential.password_salt, credential.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    try:
        supabase_admin_confirm_email(normalized_email)
    except SupabaseAuthError:
        # Local auth flow should keep working even when Supabase admin confirmation is unavailable.
        pass

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    if not profile:
        profile = CreatorProfile(user_id=user.id, multilingual_profile=[user.language], preferences={})
        db.add(profile)

    profile.preferences = {
        **(profile.preferences or {}),
        "email_code_verified": True,
        "email_verified_at": datetime.now(tz=UTC).isoformat(),
        "email_verification_method": "password_fallback",
    }
    db.add(profile)
    db.commit()

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    return _session_payload(user, credential)


@router.post("/signup", response_model=AuthSessionResponse)
def signup(payload: AuthSignupRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    raise HTTPException(
        status_code=410,
        detail="Signup flow has changed. Request an email code first via /auth/signup/request-code.",
    )


@router.post("/login", response_model=AuthSessionResponse)
def login(payload: AuthLoginRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    normalized_email = _normalize_email(str(payload.email))

    auth_payload: dict | None = None
    try:
        auth_payload = supabase_sign_in(normalized_email, payload.password)
    except SupabaseAuthError as exc:
        message = str(exc)
        if _is_auth_rate_limited(message, exc.status_code) or exc.status_code >= 500:
            auth_payload = {
                "user": {
                    "id": stable_fallback_user_id(normalized_email),
                    "email": normalized_email,
                    "user_metadata": {},
                },
            }
        else:
            auth_payload = None

    if auth_payload is None:
        existing_user = db.scalar(select(User).where(User.email == normalized_email))
        if existing_user:
            credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == existing_user.id))
            if credential and _verify_password(payload.password, credential.password_salt, credential.password_hash):
                auth_payload = {
                    "user": {
                        "id": str(existing_user.id),
                        "email": existing_user.email,
                        "user_metadata": {},
                    },
                }
            else:
                auth_payload = None
        else:
            auth_payload = None

    if auth_payload is None:
        raise HTTPException(status_code=401, detail="Invalid login credentials")

    supabase_login_ok = isinstance(auth_payload, dict) and bool(auth_payload.get("access_token"))

    auth_user = auth_payload.get("user") if isinstance(auth_payload, dict) else {}
    user_meta = auth_user.get("user_metadata") if isinstance(auth_user, dict) else {}
    has_onboarding_flag, onboarding_from_meta = _extract_onboarding_state(
        user_meta if isinstance(user_meta, dict) else None
    )

    user = db.scalar(select(User).where(User.email == normalized_email))
    credential: AuthCredential | None = None
    if not user:
        display_name = normalized_email.split("@")[0]
        if isinstance(user_meta, dict):
            display_name = str(user_meta.get("full_name") or display_name)

        user = User(
            email=normalized_email,
            display_name=display_name,
            onboarding_complete=onboarding_from_meta,
        )
        db.add(user)
        db.flush()

        username_seed = normalized_email.split("@")[0]
        if isinstance(user_meta, dict):
            username_seed = str(user_meta.get("username") or username_seed)

        placeholder_salt, placeholder_hash = _hash_password(secrets.token_urlsafe(16))
        credential = AuthCredential(
            user_id=user.id,
            username=_ensure_unique_username(db, username_seed),
            full_name=display_name,
            password_salt=placeholder_salt,
            password_hash=placeholder_hash,
            remember_me_default=payload.remember_me,
        )
        db.add(credential)

        profile = CreatorProfile(
            user_id=user.id,
            multilingual_profile=[user.language],
        )
        db.add(profile)
    else:
        if has_onboarding_flag:
            user.onboarding_complete = user.onboarding_complete or onboarding_from_meta
        elif not user.onboarding_complete:
            # Accounts without onboarding metadata are treated as already onboarded.
            user.onboarding_complete = True

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    fallback_login = isinstance(auth_payload, dict) and auth_payload.get("access_token") == "fallback-token"

    if credential is None and user.id:
        credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    if credential:
        local_password_matches = _verify_password(payload.password, credential.password_salt, credential.password_hash)
    else:
        local_password_matches = False

    if not supabase_login_ok and not local_password_matches and not fallback_login:
        raise HTTPException(status_code=401, detail="Invalid login credentials")

    if profile:
        profile.preferences = {
            **(profile.preferences or {}),
            "email_code_verified": True
            if supabase_login_ok or fallback_login or local_password_matches
            else bool(profile.preferences.get("email_code_verified")),
            "email_verification_method": "fallback" if fallback_login else (profile.preferences.get("email_verification_method") or "local"),
        }
        db.add(profile)

    if credential is None:
        placeholder_salt, placeholder_hash = _hash_password(secrets.token_urlsafe(16))
        credential = AuthCredential(
            user_id=user.id,
            username=_ensure_unique_username(db, normalized_email.split("@")[0]),
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
    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    return _session_payload(user, credential, profile)


@router.post("/google/session", response_model=AuthSessionResponse)
def google_session(payload: AuthGoogleTokenRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    try:
        auth_user = supabase_get_user(str(payload.access_token).strip())
    except SupabaseAuthError as exc:
        raise HTTPException(status_code=max(400, min(exc.status_code, 499)), detail=str(exc)) from exc

    normalized_email = _normalize_email(str(auth_user.get("email") or ""))
    if not normalized_email:
        raise HTTPException(status_code=400, detail="Google account is missing email.")

    user_meta = auth_user.get("user_metadata") if isinstance(auth_user, dict) else {}
    if not isinstance(user_meta, dict):
        user_meta = {}

    full_name = str(user_meta.get("full_name") or normalized_email.split("@")[0]).strip()
    username_seed = str(user_meta.get("user_name") or user_meta.get("preferred_username") or normalized_email.split("@")[0])

    user = db.scalar(select(User).where(User.email == normalized_email))
    if not user:
        user = User(
            email=normalized_email,
            display_name=full_name,
            onboarding_complete=False,
        )
        db.add(user)
        db.flush()

        placeholder_salt, placeholder_hash = _hash_password(secrets.token_urlsafe(16))
        credential = AuthCredential(
            user_id=user.id,
            username=_ensure_unique_username(db, username_seed),
            full_name=full_name,
            password_salt=placeholder_salt,
            password_hash=placeholder_hash,
            remember_me_default=True,
        )
        db.add(credential)

        profile = CreatorProfile(
            user_id=user.id,
            multilingual_profile=[user.language],
            preferences={
                "email_code_verified": True,
                "email_verification_method": "google_oauth",
                "email_verified_at": datetime.now(tz=UTC).isoformat(),
            },
        )
        db.add(profile)
    else:
        if not user.display_name or user.display_name == normalized_email.split("@")[0]:
            user.display_name = full_name

        credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
        if not credential:
            placeholder_salt, placeholder_hash = _hash_password(secrets.token_urlsafe(16))
            credential = AuthCredential(
                user_id=user.id,
                username=_ensure_unique_username(db, username_seed),
                full_name=full_name,
                password_salt=placeholder_salt,
                password_hash=placeholder_hash,
                remember_me_default=True,
            )
            db.add(credential)

        profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
        if not profile:
            profile = CreatorProfile(
                user_id=user.id,
                multilingual_profile=[user.language],
                preferences={},
            )
            db.add(profile)

        profile.preferences = {
            **(profile.preferences or {}),
            "email_code_verified": True,
            "email_verification_method": "google_oauth",
            "email_verified_at": datetime.now(tz=UTC).isoformat(),
        }
        db.add(profile)

    db.commit()
    db.refresh(user)

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    return _session_payload(user, credential, profile)


@router.get("/session/{user_id}", response_model=AuthSessionResponse)
def get_session(user_id: int, db: Session = Depends(get_db)) -> AuthSessionResponse:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    return _session_payload(user, credential, profile)


@router.post("/avatar", response_model=AuthSessionResponse)
def update_avatar(payload: AvatarUpdateRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    avatar_url = str(payload.avatar_url or "").strip()
    if not avatar_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Avatar must be an uploaded image data URL.")

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    if not profile:
        profile = CreatorProfile(user_id=user.id, preferences={})
        db.add(profile)

    profile.preferences = {
        **(profile.preferences or {}),
        "avatar_url": avatar_url,
        "avatar_updated_at": datetime.now(tz=UTC).isoformat(),
    }
    db.add(profile)
    db.commit()
    db.refresh(user)
    db.refresh(profile)

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    return _session_payload(user, credential, profile)


@router.post("/profile", response_model=AuthSessionResponse)
def update_profile(payload: AuthProfileUpdateRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    display_name = str(payload.display_name or "").strip()
    if len(display_name) < 2:
        raise HTTPException(status_code=400, detail="Display name must be at least 2 characters.")

    user.display_name = display_name

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    if credential:
        if payload.username is not None:
            next_username = str(payload.username).strip()
            username_taken = db.scalar(select(AuthCredential).where(AuthCredential.username == next_username))
            if username_taken and username_taken.user_id != user.id:
                raise HTTPException(status_code=409, detail="Username is already taken.")
            credential.username = next_username

        if payload.full_name is not None:
            credential.full_name = str(payload.full_name).strip() or display_name
        else:
            credential.full_name = credential.full_name or display_name
    else:
        placeholder_salt, placeholder_hash = _hash_password(secrets.token_urlsafe(16))
        requested_username = str(payload.username or "").strip() or user.email.split("@")[0]
        safe_username = _ensure_unique_username(db, requested_username)
        credential = AuthCredential(
            user_id=user.id,
            username=safe_username,
            full_name=str(payload.full_name or "").strip() or display_name,
            password_salt=placeholder_salt,
            password_hash=placeholder_hash,
            remember_me_default=False,
        )
        db.add(credential)

    db.commit()
    db.refresh(user)

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    return _session_payload(user, credential, profile)


@router.post("/onboarding", response_model=AuthSessionResponse)
def onboarding(payload: OnboardingRequest, db: Session = Depends(get_db)) -> AuthSessionResponse:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    if not profile:
        profile = CreatorProfile(user_id=user.id)
        db.add(profile)

    creator_type = _compact_list(payload.creator_type)
    platforms_used = _compact_list(payload.platforms_used)
    content_niche = _compact_list(payload.content_niche)
    audience_location = _compact_list(payload.audience_location)
    content_goals = _compact_list(payload.content_goals)
    posting_frequency = _compact_list(payload.posting_frequency)
    tone = _compact_list(payload.tone)
    personality = _compact_list(payload.personality)

    profile.niche = _first_or_default(content_niche, profile.niche or "creator")
    profile.tone = _first_or_default(tone, profile.tone or "confident")
    profile.preferences = {
        **(profile.preferences or {}),
        "creator_type": creator_type,
        "platforms_used": platforms_used,
        "audience_location": audience_location,
        "content_goals": content_goals,
        "posting_frequency": posting_frequency,
        "personality": personality,
        "tones": tone,
        "niches": content_niche,
        "initialized_at": datetime.now(tz=UTC).isoformat(),
    }

    onboarding_memory = {
        "onboarding_creator_type": ", ".join(creator_type) or "creator",
        "onboarding_platforms": ", ".join(platforms_used) or "none",
        "onboarding_niches": ", ".join(content_niche) or "creator",
        "onboarding_audience_locations": ", ".join(audience_location) or "global",
        "onboarding_content_goals": ", ".join(content_goals) or "grow audience",
        "onboarding_posting_frequency": ", ".join(posting_frequency) or "weekly",
        "onboarding_tones": ", ".join(tone) or "conversational",
        "onboarding_personality": ", ".join(personality) or "conversational",
    }
    for memory_key, memory_value in onboarding_memory.items():
        _upsert_creator_memory(db, user.id, memory_key, memory_value)

    user.onboarding_complete = True

    db.commit()
    db.refresh(user)

    # Best-effort: write onboarding_complete to Supabase user_metadata so
    # admin analytics stay accurate even when the local DB is ephemeral.
    supabase_mark_onboarding_complete(user.email)

    credential = db.scalar(select(AuthCredential).where(AuthCredential.user_id == user.id))
    return _session_payload(user, credential)


@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
def request_password_reset(
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
) -> PasswordResetRequestResponse:
    normalized_email = _normalize_email(str(payload.email))

    try:
        supabase_request_password_reset(normalized_email)
    except SupabaseAuthError:
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
    except SupabaseAuthError as exc:
        if _is_auth_rate_limited(str(exc), exc.status_code):
            raise HTTPException(
                status_code=429,
                detail="Too many reset attempts right now. Please wait a minute and try again.",
            ) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"message": "Password reset successful. You can now log in."}


@router.get("/supabase-config")
def supabase_config() -> dict[str, str | bool]:
    return {
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_anon_key,
        "google_oauth_enabled": settings.google_oauth_enabled,
    }
