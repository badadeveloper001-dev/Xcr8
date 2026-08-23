from __future__ import annotations

from datetime import UTC, datetime, timedelta
import logging
from secrets import token_hex

from fastapi import APIRouter, Depends, HTTPException, Request
import httpx
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import ConnectedPlatform, ContentPost, Platform, PostVariant, User
from app.services.entitlements import ensure_social_account_capacity
from app.services.profile_scope import current_profile_id
from app.services.pulse import record_pulse_event
from app.services.social_publisher import (
    configured_platforms,
    exchange_code_for_token,
    fetch_facebook_page_connection,
    fetch_instagram_business_connection,
    fetch_platform_user_info,
    get_oauth_authorize_url,
    is_platform_configured,
    publish_to_platform,
    verify_oauth_state,
)

router = APIRouter(prefix="/social", tags=["social"])
logger = logging.getLogger(__name__)


# In-memory tracker for deletion callbacks. Good enough for callback verification
# and lightweight status checks in stateless deployments.
_META_DELETION_REQUESTS: dict[str, dict[str, str]] = {}


def _duration_seconds(value: object, default: int = 0) -> int:
    """Accept provider values that may be returned as a numeric string or float."""
    try:
        return max(0, int(float(value or default)))
    except (TypeError, ValueError):
        return default


def _parse_iso_datetime(value: str | None) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None


def _refresh_google_token(refresh_token: str) -> dict | None:
    if not refresh_token:
        return None
    client_id = str(settings.google_client_id or "").strip()
    client_secret = str(settings.google_client_secret or "").strip()
    if not client_id or not client_secret:
        return None
    try:
        with httpx.Client(timeout=12.0) as client:
            response = client.post(
                "https://oauth2.googleapis.com/token",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
        if response.status_code >= 400:
            return None
        payload = response.json()
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def _refresh_threads_token(access_token: str) -> dict | None:
    if not access_token:
        return None
    try:
        with httpx.Client(timeout=12.0) as client:
            response = client.get(
                "https://graph.threads.net/refresh_access_token",
                params={
                    "grant_type": "th_refresh_token",
                    "access_token": access_token,
                },
            )
        if response.status_code >= 400:
            return None
        payload = response.json()
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def _exchange_threads_long_lived_token(access_token: str) -> dict | None:
    if not access_token:
        return None
    client_secret = str(settings.threads_app_secret or "").strip()
    if not client_secret:
        return None
    try:
        with httpx.Client(timeout=12.0) as client:
            response = client.get(
                "https://graph.threads.net/access_token",
                params={
                    "grant_type": "th_exchange_token",
                    "client_secret": client_secret,
                    "access_token": access_token,
                },
            )
        if response.status_code >= 400:
            return None
        payload = response.json()
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# OAuth helpers
# ─────────────────────────────────────────────────────────────────────────────

def _redirect_uri() -> str:
    base = (settings.frontend_url or "").rstrip("/")
    return f"{base}/auth/platform-callback"


def _api_base_uri() -> str:
    base = (settings.frontend_url or "").rstrip("/")
    return f"{base}/api/v1"


@router.post("/meta/uninstall")
async def meta_uninstall_callback(request: Request) -> dict:
    """Receives deauthorization callbacks from Meta products."""
    # We currently do not map signed_request payloads back to user records.
    # Returning success allows dashboard verification and future expansion.
    _ = await request.body()
    return {"success": True}


@router.post("/meta/delete")
async def meta_delete_callback(request: Request) -> dict:
    """Receives data deletion requests and returns status URL + confirmation code."""
    body = await request.body()
    confirmation_code = token_hex(8)
    _META_DELETION_REQUESTS[confirmation_code] = {
        "status": "received",
        "received_at": datetime.now(tz=UTC).isoformat(),
        "payload_bytes": str(len(body)),
    }

    status_url = f"{_api_base_uri()}/social/meta/delete/status/{confirmation_code}"
    return {
        "url": status_url,
        "confirmation_code": confirmation_code,
    }


@router.get("/meta/delete/status/{confirmation_code}")
def meta_delete_status(confirmation_code: str) -> dict:
    """Simple status endpoint returned to Meta for deletion callback workflows."""
    status = _META_DELETION_REQUESTS.get(confirmation_code)
    if not status:
        raise HTTPException(status_code=404, detail="Unknown confirmation code.")
    return {
        "confirmation_code": confirmation_code,
        **status,
    }


# ─────────────────────────────────────────────────────────────────────────────
# OAuth routes
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/oauth/providers")
def list_oauth_providers() -> dict:
    """Returns which platforms have OAuth credentials configured on this deployment."""
    return {
        "configured": configured_platforms(),
        "all": list(["instagram", "facebook", "x", "linkedin", "tiktok", "youtube_shorts", "threads"]),
    }


@router.get("/oauth/{platform}/start")
def oauth_start(platform: str, user_id: int, db: Session = Depends(get_db)) -> dict:
    """Returns the OAuth authorization URL for the given platform."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    ensure_social_account_capacity(db, user_id, platform)

    if not is_platform_configured(platform):
        hints_by_platform = {
            "facebook": "META_APP_ID, META_APP_SECRET",
            "instagram": "META_APP_ID, META_APP_SECRET",
            "threads": "THREADS_APP_ID, THREADS_APP_SECRET",
            "x": "TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET",
            "linkedin": "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET",
            "tiktok": "TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET",
            "youtube_shorts": "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET",
        }
        hint = hints_by_platform.get(platform, "META_APP_ID, META_APP_SECRET")
        raise HTTPException(
            status_code=501,
            detail=(
                f"{platform.title()} OAuth is not configured on this deployment. "
                "Please add the platform app credentials to your environment variables "
                f"(e.g. {hint}) and redeploy. "
                "You can still connect a channel manually using the handle form."
            ),
        )

    redirect_uri = _redirect_uri()
    if not redirect_uri.startswith("http"):
        raise HTTPException(
            status_code=503,
            detail="Frontend URL is not configured. Set FRONTEND_URL in environment variables.",
        )

    auth_url = get_oauth_authorize_url(platform, user_id, redirect_uri, current_profile_id())
    if not auth_url:
        raise HTTPException(status_code=500, detail="Failed to build authorization URL.")

    return {"auth_url": auth_url, "redirect_uri": redirect_uri}


class OAuthCallbackPayload(BaseModel):
    code: str
    state: str


def _oauth_callback_impl(
    platform: str,
    payload: OAuthCallbackPayload,
    db: Session,
) -> dict:
    """Exchanges the authorization code for a token and stores it."""
    state_data = verify_oauth_state(payload.state)
    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")

    user_id = int(state_data["u"])
    raw_workspace_id = state_data.get("w")
    workspace_id = int(raw_workspace_id) if raw_workspace_id not in {None, "", 0, "0"} else None
    state_platform = str(state_data["p"])
    if state_platform != platform:
        raise HTTPException(status_code=400, detail="State platform mismatch.")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    redirect_uri = _redirect_uri()
    token_data = exchange_code_for_token(platform, payload.code, payload.state, redirect_uri)
    if not token_data:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Could not exchange authorization code for {platform}. "
                "The code may have expired or the app credentials are misconfigured."
            ),
        )

    token_exchange_error = str(token_data.get("_token_exchange_error") or "").strip()
    if token_exchange_error:
        raise HTTPException(
            status_code=502,
            detail=(
                f"{platform} token exchange failed: {token_exchange_error}. "
                "Verify OAuth client credentials and redirect URI configuration."
            ),
        )

    access_token = str(token_data.get("access_token") or "")
    if not access_token:
        raise HTTPException(status_code=502, detail="Platform did not return an access token.")

    refresh_token = str(token_data.get("refresh_token") or "")
    expires_in = token_data.get("expires_in")
    token_expires_at = None
    if expires_in:
        token_expires_at = (datetime.now(tz=UTC) + timedelta(seconds=_duration_seconds(expires_in))).isoformat()

    user_info = fetch_platform_user_info(platform, access_token)
    handle = user_info.get("handle") or platform
    platform_user_id = user_info.get("platform_user_id") or ""

    page_info: dict[str, str] | None = None
    source_user_access_token = access_token
    if platform == "facebook":
        page_info = fetch_facebook_page_connection(source_user_access_token)
        if not page_info:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Facebook connected, but no publishable Page was found for this account. "
                    "Grant page permissions and ensure your Facebook Page is linked to the app."
                ),
            )

        page_token = str(page_info.get("page_access_token") or "").strip()
        page_id = str(page_info.get("page_id") or "").strip()
        page_name = str(page_info.get("page_name") or "").strip()

        if page_token:
            access_token = page_token
        if page_id:
            platform_user_id = page_id
        if page_name:
            handle = page_name

    if platform == "instagram":
        ig_info = fetch_instagram_business_connection(source_user_access_token)
        if not ig_info:
            token_diag = {
                "keys": sorted([str(k) for k in token_data.keys()]),
                "user_id": token_data.get("user_id"),
                "profile_id": token_data.get("profile_id"),
                "granular_scopes": token_data.get("granular_scopes"),
                "granted_scopes": token_data.get("granted_scopes"),
                "scope": token_data.get("scope"),
            }
            print(f"instagram_oauth_token_diag={token_diag}")

            # Business Login can return selected IG asset IDs in granular_scopes
            # even when /me/accounts does not include linked IG account objects.
            granular_scopes = token_data.get("granular_scopes")
            target_ig_id = ""
            if isinstance(granular_scopes, list):
                for scope_entry in granular_scopes:
                    if not isinstance(scope_entry, dict):
                        continue
                    scope_name = str(scope_entry.get("scope") or "").strip()
                    if not scope_name.startswith("instagram_"):
                        continue
                    target_ids = scope_entry.get("target_ids")
                    if not isinstance(target_ids, list):
                        continue
                    for target_id in target_ids:
                        candidate = str(target_id or "").strip()
                        if candidate:
                            target_ig_id = candidate
                            break
                    if target_ig_id:
                        break

            if target_ig_id:
                ig_info = {
                    "ig_user_id": target_ig_id,
                    "ig_username": "",
                    "page_id": "",
                    "page_name": "",
                    "page_access_token": "",
                }

        if not ig_info:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Instagram connected, but no publishable Instagram professional account was resolved. "
                    "Ensure the account is Professional (Business or Creator), linked to the app, "
                    "and if using Facebook Login, connected to a Facebook Page."
                ),
            )

        ig_user_id = str(ig_info.get("ig_user_id") or "").strip()
        ig_username = str(ig_info.get("ig_username") or "").strip()
        page_token = str(ig_info.get("page_access_token") or "").strip()

        if not ig_user_id:
            raise HTTPException(
                status_code=400,
                detail="Instagram business account ID is missing. Reconnect after linking IG to a Facebook Page.",
            )

        if page_token:
            access_token = page_token
        platform_user_id = ig_user_id
        if ig_username:
            handle = f"@{ig_username}"
        elif ig_info.get("page_name"):
            handle = str(ig_info.get("page_name"))

    if platform == "threads":
        long_lived = _exchange_threads_long_lived_token(access_token)
        if long_lived and str(long_lived.get("access_token") or "").strip():
            access_token = str(long_lived.get("access_token") or "").strip()
            expires_in = _duration_seconds(long_lived.get("expires_in"))
            if expires_in > 0:
                token_expires_at = (datetime.now(tz=UTC) + timedelta(seconds=expires_in)).isoformat()

    try:
        platform_enum = Platform(platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")

    auth_meta = {
        "connection_method": "oauth",
        "access_token": access_token,
        "refresh_token": refresh_token or None,
        "token_expires_at": token_expires_at,
        "platform_user_id": platform_user_id,
        "sync_status": "synced",
        "linked_at": datetime.now(tz=UTC).isoformat(),
        "scopes": token_data.get("scope") or token_data.get("scopes") or "",
    }
    if platform == "facebook" and page_info:
        auth_meta.update(
            {
                "page_id": page_info.get("page_id") or platform_user_id,
                "page_name": page_info.get("page_name") or handle,
                "source_user_access_token": source_user_access_token,
            }
        )
    if platform == "instagram":
        auth_meta["source_user_access_token"] = source_user_access_token

    ensure_social_account_capacity(db, user_id, platform)

    existing = db.scalar(
        select(ConnectedPlatform).where(
            ConnectedPlatform.user_id == user_id,
            ConnectedPlatform.platform == platform_enum,
            ConnectedPlatform.workspace_id == workspace_id,
        )
    )
    if existing:
        existing.account_handle = handle
        existing.is_active = True
        existing.auth_meta = auth_meta
        db.commit()
        db.refresh(existing)
        row = existing
    else:
        row = ConnectedPlatform(
            user_id=user_id,
            workspace_id=workspace_id,
            platform=platform_enum,
            account_handle=handle,
            is_active=True,
            auth_meta=auth_meta,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

    return {
        "platform": platform,
        "handle": handle,
        "platform_user_id": platform_user_id,
        "success": True,
        "connection_id": row.id,
    }


@router.post("/oauth/{platform}/callback")
def oauth_callback(
    platform: str,
    payload: OAuthCallbackPayload,
    db: Session = Depends(get_db),
) -> dict:
    """Complete OAuth without turning provider or database failures into a generic 500."""
    try:
        return _oauth_callback_impl(platform, payload, db)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("OAuth callback finalization failed for %s", platform)
        if platform == "threads":
            error_type = exc.__class__.__name__
            raise HTTPException(
                status_code=502,
                detail=(
                    "Threads authorization succeeded, but Xcr8 could not save the connection "
                    f"({error_type}). Check the Vercel function logs for the matching error."
                ),
            ) from exc
        raise


# ─────────────────────────────────────────────────────────────────────────────
# Publish route
# ─────────────────────────────────────────────────────────────────────────────

class PublishPostRequest(BaseModel):
    user_id: int
    post_id: int
    platforms: list[str] | None = None  # None means publish to all approved platforms
    pulse_source: str = "direct"
    schedule_id: int | None = None


@router.post("/publish")
def publish_post(
    payload: PublishPostRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Publish an approved post to connected social platforms."""
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    post = db.get(ContentPost, payload.post_id)
    if not post or post.user_id != payload.user_id:
        raise HTTPException(status_code=404, detail="Post not found")

    # Determine which platforms to publish to
    target_platforms: set[str] = set(payload.platforms or [])

    # Get approved variants
    variants = list(
        db.scalars(
            select(PostVariant).where(
                PostVariant.post_id == post.id,
                PostVariant.approved == True,  # noqa: E712
            )
        )
    )

    if not variants:
        raise HTTPException(
            status_code=400,
            detail="No approved variants found. Please approve the post variants before publishing.",
        )

    # If specific platforms given, filter to those; otherwise use all approved variant platforms
    if target_platforms:
        variants = [v for v in variants if v.platform.value in target_platforms]
        if not variants:
            raise HTTPException(
                status_code=400,
                detail="None of the specified platforms have approved variants.",
            )

    # Get connected platforms with OAuth tokens for this user
    connected = {
        row.platform.value: row
        for row in db.scalars(
            select(ConnectedPlatform).where(
                ConnectedPlatform.user_id == payload.user_id,
                ConnectedPlatform.workspace_id == post.workspace_id,
                ConnectedPlatform.is_active == True,  # noqa: E712
            )
        )
    }

    results: dict[str, dict] = {}
    published_any = False

    for variant in variants:
        platform_name = variant.platform.value
        caption_with_hashtags = variant.adapted_caption
        if variant.hashtags:
            caption_with_hashtags = f"{caption_with_hashtags}\n{' '.join(variant.hashtags)}"

        content_meta = post.content_meta if isinstance(post.content_meta, dict) else {}
        media_urls = content_meta.get("media_urls") if isinstance(content_meta.get("media_urls"), list) else []
        media_types = content_meta.get("media_types") if isinstance(content_meta.get("media_types"), list) else []
        primary_media_url = str((media_urls[0] if media_urls else post.media_url) or "").strip() or None
        primary_media_type = str((media_types[0] if media_types else post.media_type) or "image").strip()

        connection = connected.get(platform_name)
        if not connection:
            results[platform_name] = {
                "success": False,
                "error": (
                    f"No active connection for {platform_name}. "
                    "Go to Settings → Connected Platforms and connect this account first."
                ),
            }
            continue

        auth_meta = connection.auth_meta if isinstance(connection.auth_meta, dict) else {}
        access_token = str(auth_meta.get("access_token") or "")
        platform_user_id = str(auth_meta.get("platform_user_id") or "")
        connection_method = str(auth_meta.get("connection_method") or "manual")

        # Refresh platform tokens just-in-time for publish operations.
        if platform_name == "youtube_shorts":
            refreshed = _refresh_google_token(str(auth_meta.get("refresh_token") or ""))
            if refreshed and refreshed.get("access_token"):
                access_token = str(refreshed.get("access_token") or "").strip()
                auth_meta["access_token"] = access_token
                expires_in = _duration_seconds(refreshed.get("expires_in"), 3600)
                auth_meta["token_expires_at"] = (datetime.now(tz=UTC) + timedelta(seconds=expires_in)).isoformat()
                connection.auth_meta = auth_meta
                db.commit()
        elif platform_name == "threads":
            expires_at = _parse_iso_datetime(str(auth_meta.get("token_expires_at") or ""))
            should_refresh = False
            if expires_at is None:
                should_refresh = True
            else:
                should_refresh = expires_at <= (datetime.now(tz=UTC) + timedelta(days=14))

            if should_refresh:
                refreshed = _refresh_threads_token(access_token)
                if refreshed and refreshed.get("access_token"):
                    access_token = str(refreshed.get("access_token") or "").strip()
                    auth_meta["access_token"] = access_token
                    expires_in = _duration_seconds(refreshed.get("expires_in"))
                    if expires_in > 0:
                        auth_meta["token_expires_at"] = (datetime.now(tz=UTC) + timedelta(seconds=expires_in)).isoformat()
                    connection.auth_meta = auth_meta
                    db.commit()

        if connection_method == "manual" or not access_token:
            results[platform_name] = {
                "success": False,
                "error": (
                    f"{platform_name.title()} is connected manually (handle only). "
                    "Reconnect via OAuth to enable direct publishing from Xcr8."
                ),
            }
            continue

        result = publish_to_platform(
            platform=platform_name,
            access_token=access_token,
            caption=caption_with_hashtags,
            media_url=primary_media_url,
            platform_user_id=platform_user_id or None,
            media_type=primary_media_type,
            media_urls=[str(url).strip() for url in media_urls if str(url).strip()],
            media_types=[str(kind).strip() for kind in media_types if str(kind).strip()],
        )
        results[platform_name] = result
        if result.get("success"):
            published_any = True

    if not published_any and results:
        error_detail = " ".join(
            str(item.get("error") or "")
            for item in results.values()
            if isinstance(item, dict) and not item.get("success")
        )
        user_action_required = any(
            token in error_detail.lower()
            for token in ["no active connection", "connected manually", "approved variant"]
        )
        record_pulse_event(
            db,
            {
                "event_type": "publishing_failure",
                "feature": "scheduling_dispatch" if payload.pulse_source == "scheduler" else "publishing",
                "route": (
                    "/api/v1/scheduling/dispatch-due"
                    if payload.pulse_source == "scheduler"
                    else "/api/v1/social/publish"
                ),
                "method": "GET" if payload.pulse_source == "scheduler" else "POST",
                "http_status": 409 if user_action_required else 502,
                "detail": error_detail or "Social publishing returned no successful result.",
                "user_id": payload.user_id,
                "event_meta": {
                    "post_id": post.id,
                    "platforms": sorted(results),
                    "schedule_id": payload.schedule_id,
                    "source": payload.pulse_source,
                },
            },
        )

    return {
        "post_id": post.id,
        "published": published_any,
        "results": results,
    }
