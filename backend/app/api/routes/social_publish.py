from __future__ import annotations

from datetime import UTC, datetime
from secrets import token_hex

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import ConnectedPlatform, ContentPost, Platform, PostVariant, User
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


# In-memory tracker for deletion callbacks. Good enough for callback verification
# and lightweight status checks in stateless deployments.
_META_DELETION_REQUESTS: dict[str, dict[str, str]] = {}


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

    if not is_platform_configured(platform):
        hint = "META_APP_ID, META_APP_SECRET"
        if platform == "threads":
            hint = "THREADS_APP_ID, THREADS_APP_SECRET"
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

    auth_url = get_oauth_authorize_url(platform, user_id, redirect_uri)
    if not auth_url:
        raise HTTPException(status_code=500, detail="Failed to build authorization URL.")

    return {"auth_url": auth_url, "redirect_uri": redirect_uri}


class OAuthCallbackPayload(BaseModel):
    code: str
    state: str


@router.post("/oauth/{platform}/callback")
def oauth_callback(
    platform: str,
    payload: OAuthCallbackPayload,
    db: Session = Depends(get_db),
) -> dict:
    """Exchanges the authorization code for a token and stores it."""
    state_data = verify_oauth_state(payload.state)
    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")

    user_id = int(state_data["u"])
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

    access_token = str(token_data.get("access_token") or "")
    if not access_token:
        raise HTTPException(status_code=502, detail="Platform did not return an access token.")

    refresh_token = str(token_data.get("refresh_token") or "")
    expires_in = token_data.get("expires_in")
    token_expires_at = None
    if expires_in:
        from datetime import timedelta
        token_expires_at = (datetime.now(tz=UTC) + timedelta(seconds=int(expires_in))).isoformat()

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
            raise HTTPException(
                status_code=400,
                detail=(
                    "Instagram connected, but no Instagram business account was found on linked Facebook Pages. "
                    "Link your Instagram professional account to a Facebook Page and try again."
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

    existing = db.scalar(
        select(ConnectedPlatform).where(
            ConnectedPlatform.user_id == user_id,
            ConnectedPlatform.platform == platform_enum,
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


# ─────────────────────────────────────────────────────────────────────────────
# Publish route
# ─────────────────────────────────────────────────────────────────────────────

class PublishPostRequest(BaseModel):
    user_id: int
    post_id: int
    platforms: list[str] | None = None  # None means publish to all approved platforms


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
            media_url=post.media_url or None,
            platform_user_id=platform_user_id or None,
        )
        results[platform_name] = result
        if result.get("success"):
            published_any = True

    return {
        "post_id": post.id,
        "published": published_any,
        "results": results,
    }
