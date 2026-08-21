from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
from time import sleep, time
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# OAuth state helpers
# ─────────────────────────────────────────────────────────────────────────────

def _state_secret() -> str:
    return settings.supabase_jwt_secret or settings.supabase_anon_key or "xcr8-oauth-state-secret"


def build_oauth_state(user_id: int, platform: str, code_verifier: str | None = None) -> str:
    payload = json.dumps({"u": user_id, "p": platform, "t": int(time()), "cv": code_verifier})
    encoded = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    sig = hmac.new(_state_secret().encode(), encoded.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{encoded}.{sig}"


def verify_oauth_state(state: str) -> dict | None:
    """Returns payload dict {u, p, t, cv} or None if invalid/expired."""
    try:
        encoded, sig = state.rsplit(".", 1)
        expected = hmac.new(_state_secret().encode(), encoded.encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            return None
        # Pad base64 back
        padding = 4 - len(encoded) % 4
        padded = encoded + "=" * (padding % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        if int(time()) - int(payload.get("t", 0)) > 1800:
            return None
        return payload
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Platform OAuth configuration
# ─────────────────────────────────────────────────────────────────────────────

_PLATFORM_OAUTH: dict[str, dict[str, Any]] = {
    "instagram": {
        "auth_url": "https://www.facebook.com/v19.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v19.0/oauth/access_token",
        "scopes": "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement",
        "cred_keys": ("meta_app_id", "meta_app_secret"),
    },
    "facebook": {
        "auth_url": "https://www.facebook.com/v19.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v19.0/oauth/access_token",
        "scopes": "pages_manage_posts,pages_show_list",
        "cred_keys": ("meta_app_id", "meta_app_secret"),
    },
    "x": {
        "auth_url": "https://twitter.com/i/oauth2/authorize",
        "token_url": "https://api.twitter.com/2/oauth2/token",
        "scopes": "tweet.read tweet.write users.read offline.access",
        "cred_keys": ("twitter_client_id", "twitter_client_secret"),
        "pkce": True,
    },
    "linkedin": {
        "auth_url": "https://www.linkedin.com/oauth/v2/authorization",
        "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
        "scopes": "openid profile w_member_social",
        "cred_keys": ("linkedin_client_id", "linkedin_client_secret"),
    },
    "tiktok": {
        "auth_url": "https://www.tiktok.com/v2/auth/authorize/",
        "token_url": "https://open.tiktokapis.com/v2/oauth/token/",
        "scopes": "user.info.basic,video.publish",
        "cred_keys": ("tiktok_client_key", "tiktok_client_secret"),
        "client_id_param": "client_key",
        "client_secret_param": "client_secret",
    },
    "youtube_shorts": {
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scopes": "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
        "cred_keys": ("google_client_id", "google_client_secret"),
        "extra_auth_params": {"access_type": "offline", "prompt": "consent"},
    },
    "threads": {
        "auth_url": "https://threads.net/oauth/authorize",
        "token_url": "https://graph.threads.net/oauth/access_token",
        "scopes": "threads_basic,threads_content_publish,threads_manage_insights",
        "cred_keys": ("threads_app_id", "threads_app_secret"),
    },
}


def _platform_creds(platform: str) -> tuple[str, str]:
    cfg = _PLATFORM_OAUTH.get(platform, {})
    client_id_key, secret_key = cfg.get("cred_keys", ("", ""))

    client_id = str(getattr(settings, client_id_key, "") or "").strip()
    client_secret = str(getattr(settings, secret_key, "") or "").strip()

    # Support common alternative environment naming used across deployments.
    if not client_id or not client_secret:
        fallback_env_keys: dict[str, tuple[list[str], list[str]]] = {
            "youtube_shorts": (
                ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_API_CLIENT_ID"],
                ["GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_API_CLIENT_SECRET", "GOOGLE_OAUTH_SECRET"],
            ),
            "instagram": (
                ["FB_APP_ID", "FACEBOOK_APP_ID", "META_CLIENT_ID"],
                ["FB_APP_SECRET", "FACEBOOK_APP_SECRET", "META_CLIENT_SECRET"],
            ),
            "facebook": (
                ["FB_APP_ID", "FACEBOOK_APP_ID", "META_CLIENT_ID"],
                ["FB_APP_SECRET", "FACEBOOK_APP_SECRET", "META_CLIENT_SECRET"],
            ),
            "threads": (
                ["THREADS_CLIENT_ID", "META_THREADS_APP_ID"],
                ["THREADS_CLIENT_SECRET", "META_THREADS_APP_SECRET"],
            ),
        }
        id_keys, secret_keys = fallback_env_keys.get(platform, ([], []))
        if not client_id:
            for env_key in id_keys:
                env_val = str(os.getenv(env_key, "") or "").strip()
                if env_val:
                    client_id = env_val
                    break
        if not client_secret:
            for env_key in secret_keys:
                env_val = str(os.getenv(env_key, "") or "").strip()
                if env_val:
                    client_secret = env_val
                    break

    return client_id, client_secret


def is_platform_configured(platform: str) -> bool:
    client_id, client_secret = _platform_creds(platform)
    return bool(client_id.strip() and client_secret.strip())


def configured_platforms() -> list[str]:
    return [p for p in _PLATFORM_OAUTH if is_platform_configured(p)]


# ─────────────────────────────────────────────────────────────────────────────
# OAuth URL builder
# ─────────────────────────────────────────────────────────────────────────────

def get_oauth_authorize_url(platform: str, user_id: int, redirect_uri: str) -> str | None:
    cfg = _PLATFORM_OAUTH.get(platform)
    if not cfg:
        return None
    client_id, _ = _platform_creds(platform)
    if not client_id:
        return None

    code_verifier: str | None = None
    code_challenge: str | None = None
    if cfg.get("pkce"):
        code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
        digest = hashlib.sha256(code_verifier.encode()).digest()
        code_challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")

    state = build_oauth_state(user_id, platform, code_verifier)

    client_id_param = str(cfg.get("client_id_param") or "client_id")

    params: dict[str, str] = {
        client_id_param: client_id,
        "redirect_uri": redirect_uri,
        "scope": cfg["scopes"],
        "response_type": "code",
        "state": state,
    }

    for k, v in (cfg.get("extra_auth_params") or {}).items():
        params[k] = str(v)

    if code_challenge:
        params["code_challenge"] = code_challenge
        params["code_challenge_method"] = "S256"

    return f"{cfg['auth_url']}?{urlencode(params)}"


# ─────────────────────────────────────────────────────────────────────────────
# Token exchange
# ─────────────────────────────────────────────────────────────────────────────

def exchange_code_for_token(
    platform: str,
    code: str,
    state: str,
    redirect_uri: str,
) -> dict | None:
    cfg = _PLATFORM_OAUTH.get(platform)
    if not cfg:
        return None
    client_id, client_secret = _platform_creds(platform)
    if not client_id:
        return None

    state_payload = verify_oauth_state(state)
    if not state_payload:
        logger.warning("Invalid or expired OAuth state for %s", platform)
        return None

    code_verifier = state_payload.get("cv")

    client_id_param = str(cfg.get("client_id_param") or "client_id")
    client_secret_param = str(cfg.get("client_secret_param") or "client_secret")

    data: dict[str, str] = {
        client_id_param: client_id,
        client_secret_param: client_secret,
        "code": code,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    if code_verifier:
        data["code_verifier"] = code_verifier

    try:
        with httpx.Client(timeout=20.0) as client:
            if platform == "x":
                auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
                response = client.post(
                    cfg["token_url"],
                    headers={
                        "Authorization": f"Basic {auth_header}",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    data=data,
                )
            elif platform in ("instagram", "facebook"):
                # Facebook/Instagram token exchange accepts query params.
                response = client.get(cfg["token_url"], params=data)
            elif platform == "threads":
                # Meta's Threads OAuth reference specifies a POST with the code
                # exchange values in the query string, including the same redirect URI.
                response = client.post(cfg["token_url"], params=data)
            else:
                response = client.post(
                    cfg["token_url"],
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    data=data,
                )

        if response.status_code >= 400:
            detail = response.text[:300]
            try:
                payload = response.json()
                err = str(payload.get("error") or "").strip()
                err_desc = str(payload.get("error_description") or payload.get("error_message") or "").strip()
                if err or err_desc:
                    detail = f"{err}: {err_desc}".strip(": ")
            except Exception:
                pass

            logger.warning(
                "Token exchange failed %s: %s %s",
                platform, response.status_code, detail,
            )
            return {"_token_exchange_error": detail}
        return response.json()
    except Exception as exc:
        logger.error("Token exchange error %s: %s", platform, exc)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Platform user info fetchers
# ─────────────────────────────────────────────────────────────────────────────

def fetch_platform_user_info(platform: str, access_token: str) -> dict[str, str]:
    try:
        with httpx.Client(timeout=12.0) as client:
            if platform in ("instagram", "facebook"):
                resp = client.get(
                    "https://graph.facebook.com/v19.0/me",
                    params={"fields": "id,name", "access_token": access_token},
                )
                d = resp.json()
                return {"platform_user_id": d.get("id", ""), "handle": d.get("name", "")}

            elif platform == "threads":
                resp = client.get(
                    "https://graph.threads.net/v1.0/me",
                    params={"fields": "id,username", "access_token": access_token},
                )
                d = resp.json()
                username = str(d.get("username", "")).strip()
                return {
                    "platform_user_id": str(d.get("id", "")).strip(),
                    "handle": f"@{username}" if username else "Threads",
                }

            elif platform == "x":
                resp = client.get(
                    "https://api.twitter.com/2/users/me",
                    headers={"Authorization": f"Bearer {access_token}"},
                    params={"user.fields": "username,name"},
                )
                d = resp.json().get("data", {})
                return {"platform_user_id": d.get("id", ""), "handle": f"@{d.get('username', '')}"}

            elif platform == "linkedin":
                resp = client.get(
                    "https://api.linkedin.com/v2/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                d = resp.json()
                name = str(d.get("name") or f"{d.get('given_name', '')} {d.get('family_name', '')}").strip()
                return {"platform_user_id": d.get("sub", ""), "handle": name}

            elif platform == "youtube_shorts":
                resp = client.get(
                    "https://www.googleapis.com/youtube/v3/channels",
                    headers={"Authorization": f"Bearer {access_token}"},
                    params={"part": "snippet", "mine": "true"},
                )
                items = resp.json().get("items", [])
                if items:
                    snippet = items[0].get("snippet", {})
                    return {
                        "platform_user_id": items[0].get("id", ""),
                        "handle": snippet.get("title", ""),
                    }

            elif platform == "tiktok":
                resp = client.get(
                    "https://open.tiktokapis.com/v2/user/info/",
                    headers={"Authorization": f"Bearer {access_token}"},
                    params={"fields": "open_id,display_name"},
                )
                d = resp.json().get("data", {}).get("user", {})
                return {"platform_user_id": d.get("open_id", ""), "handle": d.get("display_name", "")}

    except Exception as exc:
        logger.warning("Could not fetch user info from %s: %s", platform, exc)

    return {"platform_user_id": "", "handle": ""}


def fetch_facebook_page_connection(user_access_token: str) -> dict[str, str] | None:
    """Resolve a publishable Facebook Page and page access token from a user token."""
    try:
        with httpx.Client(timeout=12.0) as client:
            response = client.get(
                "https://graph.facebook.com/v19.0/me/accounts",
                params={
                    "access_token": user_access_token,
                    "fields": "id,name,access_token,tasks",
                    "limit": 25,
                },
            )

        if response.status_code >= 400:
            logger.warning(
                "Facebook page lookup failed: %s %s",
                response.status_code,
                response.text[:300],
            )
            return None

        payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        pages = payload.get("data", []) if isinstance(payload, dict) else []
        if not isinstance(pages, list) or not pages:
            logger.warning(
                "Instagram account lookup returned no pages/assets: %s",
                str(payload)[:500],
            )
            return None

        selected: dict[str, Any] | None = None
        for page in pages:
            if not isinstance(page, dict):
                continue
            page_token = str(page.get("access_token") or "").strip()
            tasks = page.get("tasks") or []
            can_publish = isinstance(tasks, list) and (
                "CREATE_CONTENT" in tasks or "MODERATE" in tasks or "MANAGE" in tasks
            )
            if page_token and can_publish:
                selected = page
                break

        if selected is None:
            selected = next(
                (
                    page
                    for page in pages
                    if isinstance(page, dict) and str(page.get("access_token") or "").strip()
                ),
                None,
            )

        if not selected:
            return None

        return {
            "page_id": str(selected.get("id") or "").strip(),
            "page_name": str(selected.get("name") or "").strip(),
            "page_access_token": str(selected.get("access_token") or "").strip(),
        }
    except Exception as exc:
        logger.warning("Could not resolve Facebook page connection: %s", exc)
        return None


def _extract_ig_from_node(node: dict) -> dict | None:
    """Return {id, username} from a Graph node that may carry Instagram fields."""
    for field in ("instagram_business_account", "connected_instagram_account"):
        ig = node.get(field)
        if isinstance(ig, dict):
            ig_id = str(ig.get("id") or "").strip()
            if ig_id:
                return {"id": ig_id, "username": str(ig.get("username") or "").strip()}
    # Edge format: instagram_accounts.data[0]
    ia = node.get("instagram_accounts")
    if isinstance(ia, dict):
        items = ia.get("data") or []
    elif isinstance(ia, list):
        items = ia
    else:
        items = []
    for item in items:
        if isinstance(item, dict):
            ig_id = str(item.get("id") or "").strip()
            if ig_id:
                return {"id": ig_id, "username": str(item.get("username") or "").strip()}
    return None


def fetch_instagram_business_connection(user_access_token: str) -> dict[str, str] | None:
    """Resolve an Instagram business account + page access token from a Meta user token.

    Two-pass strategy:
      Pass 1 – query /me/accounts with IG subfields using the user token.
               Sufficient when instagram_basic is approved and IG is linked to a page.
      Pass 2 – for each page returned, re-query /{page-id} with the PAGE access token.
               Required by Meta when user-level IG fields are absent due to app
               permissions or account-linking configuration.
    """
    _ig_fields = (
        "id,name,access_token,"
        "instagram_business_account{id,username},"
        "connected_instagram_account{id,username},"
        "instagram_accounts{id,username}"
    )
    try:
        with httpx.Client(timeout=15.0) as client:
            accounts_resp = client.get(
                "https://graph.facebook.com/v19.0/me/accounts",
                params={"access_token": user_access_token, "fields": _ig_fields, "limit": 25},
            )

        if accounts_resp.status_code >= 400:
            logger.warning(
                "Instagram /me/accounts failed: %s %s",
                accounts_resp.status_code,
                accounts_resp.text[:300],
            )
            return None

        pages: list[dict] = accounts_resp.json().get("data") or []
        logger.info("Instagram /me/accounts returned %d page(s).", len(pages))

        # ── Pass 1: IG fields already embedded in the user-token response ──
        for page in pages:
            if not isinstance(page, dict):
                continue
            ig = _extract_ig_from_node(page)
            if ig:
                logger.info("Pass-1: IG %s found on page %s.", ig["id"], page.get("id"))
                return {
                    "ig_user_id": ig["id"],
                    "ig_username": ig["username"],
                    "page_id": str(page.get("id") or "").strip(),
                    "page_name": str(page.get("name") or "").strip(),
                    "page_access_token": str(page.get("access_token") or "").strip(),
                }

        # ── Pass 2: re-query each page with its own page access token ──
        with httpx.Client(timeout=15.0) as client:
            for page in pages:
                if not isinstance(page, dict):
                    continue
                page_token = str(page.get("access_token") or "").strip()
                page_id = str(page.get("id") or "").strip()
                if not page_token or not page_id:
                    continue

                page_resp = client.get(
                    f"https://graph.facebook.com/v19.0/{page_id}",
                    params={
                        "access_token": page_token,
                        "fields": (
                            "id,name,"
                            "instagram_business_account{id,username},"
                            "connected_instagram_account{id,username},"
                            "instagram_accounts{id,username}"
                        ),
                    },
                )
                if page_resp.status_code >= 400:
                    logger.warning(
                        "Pass-2 page query failed for %s: %s %s",
                        page_id, page_resp.status_code, page_resp.text[:200],
                    )
                    continue

                pdata = page_resp.json() if page_resp.headers.get("content-type", "").startswith("application/json") else {}
                ig = _extract_ig_from_node(pdata)
                if ig:
                    logger.info("Pass-2: IG %s found on page %s via page token.", ig["id"], page_id)
                    return {
                        "ig_user_id": ig["id"],
                        "ig_username": ig["username"],
                        "page_id": page_id,
                        "page_name": str(pdata.get("name") or page.get("name") or "").strip(),
                        "page_access_token": page_token,
                    }

        logger.warning(
            "No Instagram business account found across %d page(s). "
            "Ensure the IG account is Professional (Business or Creator) and linked to "
            "a Facebook Page via Page Settings → Instagram in Meta Business Suite.",
            len(pages),
        )
        return None
    except Exception as exc:
        logger.warning("Could not resolve Instagram business connection: %s", exc)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Platform posting
# ─────────────────────────────────────────────────────────────────────────────

PostResult = dict[str, Any]


def publish_to_platform(
    platform: str,
    access_token: str,
    caption: str,
    media_url: str | None,
    platform_user_id: str | None,
    media_type: str = "image",
    media_urls: list[str] | None = None,
    media_types: list[str] | None = None,
) -> PostResult:
    try:
        if platform == "x":
            return _post_twitter(access_token, caption, media_url)
        elif platform == "instagram":
            return _post_instagram(
                access_token,
                caption,
                media_url,
                platform_user_id,
                media_type,
                media_urls=media_urls,
                media_types=media_types,
            )
        elif platform == "facebook":
            return _post_facebook(access_token, caption, media_url, platform_user_id, media_type, media_urls=media_urls, media_types=media_types)
        elif platform == "linkedin":
            return _post_linkedin(access_token, caption, media_url, platform_user_id)
        elif platform == "threads":
            return _post_threads(access_token, caption, media_url, platform_user_id, media_type, media_urls=media_urls, media_types=media_types)
        elif platform == "tiktok":
            return {
                "success": False,
                "post_id": None,
                "post_url": None,
                "error": (
                    "TikTok requires direct video file upload via TikTok Creator tools. "
                    "Use TikTok Studio or the TikTok mobile app to post videos."
                ),
            }
        elif platform == "youtube_shorts":
            return _post_youtube_shorts(access_token, caption, media_url)
        else:
            return {"success": False, "post_id": None, "post_url": None, "error": f"Platform {platform} not supported."}
    except Exception as exc:
        logger.error("Posting to %s failed: %s", platform, exc)
        return {"success": False, "post_id": None, "post_url": None, "error": str(exc)}

def _post_twitter(access_token: str, text: str, media_url: str | None) -> PostResult:
    tweet_text = text
    if media_url:
        candidate = f"{tweet_text}\n{media_url}"
        tweet_text = candidate if len(candidate) <= 280 else tweet_text[:240] + "…"

    with httpx.Client(timeout=20.0) as client:
        response = client.post(
            "https://api.twitter.com/2/tweets",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={"text": tweet_text},
        )

    if response.status_code in (200, 201):
        tweet_id = response.json().get("data", {}).get("id", "")
        return {
            "success": True,
            "post_id": tweet_id,
            "post_url": f"https://twitter.com/i/web/status/{tweet_id}" if tweet_id else None,
            "error": None,
        }
    error_detail = response.json().get("detail") or response.text[:200]
    return {"success": False, "post_id": None, "post_url": None, "error": f"X/Twitter error: {error_detail}"}


def _post_instagram(
    access_token: str,
    caption: str,
    image_url: str | None,
    ig_user_id: str | None,
    media_type: str,
    media_urls: list[str] | None = None,
    media_types: list[str] | None = None,
) -> PostResult:
    if not ig_user_id:
        return {"success": False, "post_id": None, "post_url": None, "error": "Instagram user ID missing — please reconnect your account."}

    urls = [str(url).strip() for url in (media_urls or []) if str(url).strip()]
    if not urls and image_url:
        urls = [image_url]
    types = [str(kind or "image").strip().lower() for kind in (media_types or [])]
    if not urls:
        return {"success": False, "post_id": None, "post_url": None, "error": "Instagram requires an image or video URL."}

    if len(urls) > 10:
        return {"success": False, "post_id": None, "post_url": None, "error": "Instagram carousels support a maximum of 10 media items."}

    if len(urls) > 1:
        if any(
            (types[index] if index < len(types) else media_type).startswith("video")
            or url.lower().split("?")[0].endswith((".mp4", ".mov", ".webm"))
            for index, url in enumerate(urls)
        ):
            return {
                "success": False,
                "post_id": None,
                "post_url": None,
                "error": "Xcr8 currently supports Instagram carousels with images only. Publish video as a Reel.",
            }

        with httpx.Client(timeout=45.0) as client:
            children: list[str] = []
            for url in urls:
                child_resp = client.post(
                    f"https://graph.facebook.com/v19.0/{ig_user_id}/media",
                    params={"image_url": url, "is_carousel_item": "true", "access_token": access_token},
                )
                if child_resp.status_code >= 400:
                    err = (child_resp.json().get("error") or {}).get("message", child_resp.text[:200])
                    return {"success": False, "post_id": None, "post_url": None, "error": f"Instagram carousel item error: {err}"}
                child_id = str(child_resp.json().get("id") or "").strip()
                if not child_id:
                    return {"success": False, "post_id": None, "post_url": None, "error": "Instagram did not return a carousel item ID."}
                children.append(child_id)

            container_resp = client.post(
                f"https://graph.facebook.com/v19.0/{ig_user_id}/media",
                params={
                    "media_type": "CAROUSEL",
                    "children": ",".join(children),
                    "caption": caption,
                    "access_token": access_token,
                },
            )
            if container_resp.status_code >= 400:
                err = (container_resp.json().get("error") or {}).get("message", container_resp.text[:200])
                return {"success": False, "post_id": None, "post_url": None, "error": f"Instagram carousel error: {err}"}
            creation_id = str(container_resp.json().get("id") or "").strip()
            if not creation_id:
                return {"success": False, "post_id": None, "post_url": None, "error": "Instagram did not return a carousel container ID."}

            publish_resp = client.post(
                f"https://graph.facebook.com/v19.0/{ig_user_id}/media_publish",
                params={"creation_id": creation_id, "access_token": access_token},
            )
            if publish_resp.status_code >= 400:
                err = (publish_resp.json().get("error") or {}).get("message", publish_resp.text[:200])
                return {"success": False, "post_id": None, "post_url": None, "error": f"Instagram carousel publish error: {err}"}

        post_id = str(publish_resp.json().get("id") or "")
        return {
            "success": True,
            "post_id": post_id,
            "post_url": f"https://www.instagram.com/p/{post_id}/" if post_id else None,
            "error": None,
        }

    image_url = urls[0]
    selected_type = types[0] if types else media_type
    is_video = selected_type.startswith("video") or image_url.lower().split("?")[0].endswith((".mp4", ".mov", ".webm"))

    with httpx.Client(timeout=30.0) as client:
        container_params = {"caption": caption, "access_token": access_token}
        if is_video:
            container_params.update({"media_type": "REELS", "video_url": image_url})
        else:
            container_params.update({"image_url": image_url})

        container_resp = client.post(
            f"https://graph.facebook.com/v19.0/{ig_user_id}/media",
            params=container_params,
        )
        if container_resp.status_code >= 400:
            err = (container_resp.json().get("error") or {}).get("message", container_resp.text[:200])
            return {"success": False, "post_id": None, "post_url": None, "error": f"Instagram container error: {err}"}

        creation_id = container_resp.json().get("id")
        if not creation_id:
            return {"success": False, "post_id": None, "post_url": None, "error": "Instagram did not return a container ID."}

        publish_resp = client.post(
            f"https://graph.facebook.com/v19.0/{ig_user_id}/media_publish",
            params={"creation_id": creation_id, "access_token": access_token},
        )
        if publish_resp.status_code >= 400:
            err = (publish_resp.json().get("error") or {}).get("message", publish_resp.text[:200])
            return {"success": False, "post_id": None, "post_url": None, "error": f"Instagram publish error: {err}"}

    post_id = publish_resp.json().get("id", "")
    return {
        "success": True,
        "post_id": post_id,
        "post_url": f"https://www.instagram.com/p/{post_id}/" if post_id else None,
        "error": None,
    }

def _post_facebook(
    access_token: str,
    message: str,
    media_url: str | None,
    page_id: str | None,
    media_type: str,
    media_urls: list[str] | None = None,
    media_types: list[str] | None = None,
) -> PostResult:
    if not page_id:
        return {"success": False, "post_id": None, "post_url": None, "error": "Facebook Page ID missing — please reconnect your account."}

    urls = [str(url).strip() for url in (media_urls or []) if str(url).strip()]
    if not urls and media_url:
        urls = [media_url]
    types = [str(kind or "image").strip().lower() for kind in (media_types or [])]

    if len(urls) > 1:
        if len(urls) > 10:
            return {"success": False, "post_id": None, "post_url": None, "error": "Facebook multi-photo posts support a maximum of 10 images."}
        if any(
            (types[index] if index < len(types) else media_type).startswith("video")
            or url.lower().split("?")[0].endswith((".mp4", ".mov", ".webm"))
            for index, url in enumerate(urls)
        ):
            return {"success": False, "post_id": None, "post_url": None, "error": "Facebook multi-image posts currently support images only. Publish video separately."}

        with httpx.Client(timeout=45.0) as client:
            attached_media: list[dict[str, str]] = []
            for url in urls:
                upload_resp = client.post(
                    f"https://graph.facebook.com/v19.0/{page_id}/photos",
                    data={"url": url, "published": "false", "access_token": access_token},
                )
                if upload_resp.status_code >= 400:
                    err = (upload_resp.json().get("error") or {}).get("message", upload_resp.text[:200])
                    return {"success": False, "post_id": None, "post_url": None, "error": f"Facebook multi-photo upload error: {err}"}
                photo_id = str(upload_resp.json().get("id") or "").strip()
                if not photo_id:
                    return {"success": False, "post_id": None, "post_url": None, "error": "Facebook did not return a photo ID."}
                attached_media.append({"media_fbid": photo_id})

            feed_params: dict[str, str] = {"message": message, "access_token": access_token, "published": "true"}
            for index, item in enumerate(attached_media):
                feed_params[f"attached_media[{index}]"] = json.dumps(item)
            response = client.post(f"https://graph.facebook.com/v19.0/{page_id}/feed", data=feed_params)

        if response.status_code in (200, 201):
            post_id = str(response.json().get("id") or "")
            post_url = (
                f"https://www.facebook.com/permalink.php?story_fbid={post_id.split('_')[1]}&id={page_id}"
                if "_" in post_id else f"https://www.facebook.com/{page_id}/posts/"
            )
            return {"success": True, "post_id": post_id, "post_url": post_url, "error": None}
        err = (response.json().get("error") or {}).get("message", response.text[:200])
        return {"success": False, "post_id": None, "post_url": None, "error": f"Facebook multi-photo publish error: {err}"}

    media_url = urls[0] if urls else media_url
    is_video = bool(media_url) and (media_type.startswith("video") or str(media_url).lower().split("?")[0].endswith((".mp4", ".mov", ".webm")))

    if is_video and media_url:
        video_params = {"description": message, "file_url": media_url, "published": "true", "access_token": access_token}
        with httpx.Client(timeout=30.0) as client:
            response = client.post(f"https://graph.facebook.com/v19.0/{page_id}/videos", data=video_params)
        if response.status_code in (200, 201):
            post_id = response.json().get("id", "")
            return {"success": True, "post_id": post_id, "post_url": f"https://www.facebook.com/{page_id}/videos/{post_id}" if post_id else f"https://www.facebook.com/{page_id}", "error": None}
        err = (response.json().get("error") or {}).get("message", response.text[:200])
        return {"success": False, "post_id": None, "post_url": None, "error": f"Facebook video error: {err}"}

    is_image = bool(media_url) and str(media_url).lower().split("?")[0].endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))
    if is_image and media_url:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(f"https://graph.facebook.com/v19.0/{page_id}/photos", data={"caption": message, "url": media_url, "published": "true", "access_token": access_token})
        if response.status_code in (200, 201):
            post_id = response.json().get("post_id") or response.json().get("id", "")
            page_post_url = f"https://www.facebook.com/permalink.php?story_fbid={post_id.split('_')[1]}&id={page_id}" if isinstance(post_id, str) and "_" in post_id else f"https://www.facebook.com/{page_id}"
            return {"success": True, "post_id": str(post_id), "post_url": page_post_url, "error": None}

    params: dict[str, str] = {"message": message, "access_token": access_token, "published": "true"}
    if media_url and not any(domain in media_url for domain in ["xcr8-creator-os", "vercel.app", "localhost", "127.0.0.1"]):
        params["link"] = media_url
    with httpx.Client(timeout=20.0) as client:
        response = client.post(f"https://graph.facebook.com/v19.0/{page_id}/feed", data=params)
    if response.status_code in (200, 201):
        post_id = response.json().get("id", "")
        page_post_url = f"https://www.facebook.com/permalink.php?story_fbid={post_id.split('_')[1]}&id={page_id}" if "_" in post_id else f"https://www.facebook.com/{page_id}/posts/"
        return {"success": True, "post_id": post_id, "post_url": page_post_url, "error": None}
    err = (response.json().get("error") or {}).get("message", response.text[:200])
    return {"success": False, "post_id": None, "post_url": None, "error": f"Facebook error: {err}"}

def _post_linkedin(
    access_token: str, text: str, media_url: str | None, person_id: str | None
) -> PostResult:
    if not person_id:
        return {"success": False, "post_id": None, "post_url": None, "error": "LinkedIn person ID missing — please reconnect your account."}

    author = f"urn:li:person:{person_id}"
    share_content: dict[str, Any] = {
        "shareCommentary": {"text": text},
        "shareMediaCategory": "NONE",
    }
    if media_url:
        share_content["shareMediaCategory"] = "ARTICLE"
        share_content["media"] = [{"status": "READY", "originalUrl": media_url}]

    body: dict[str, Any] = {
        "author": author,
        "lifecycleState": "PUBLISHED",
        "specificContent": {"com.linkedin.ugc.ShareContent": share_content},
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }

    with httpx.Client(timeout=20.0) as client:
        response = client.post(
            "https://api.linkedin.com/v2/ugcPosts",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0",
            },
            json=body,
        )

    if response.status_code in (200, 201):
        post_id = response.headers.get("x-restli-id", "")
        return {
            "success": True,
            "post_id": post_id,
            "post_url": "https://www.linkedin.com/feed/",
            "error": None,
        }
    err = response.json().get("message", response.text[:200])
    return {"success": False, "post_id": None, "post_url": None, "error": f"LinkedIn error: {err}"}


def _post_threads(
    access_token: str,
    text: str,
    media_url: str | None,
    user_id: str | None,
    media_type: str,
    media_urls: list[str] | None = None,
    media_types: list[str] | None = None,
) -> PostResult:
    if not user_id:
        return {"success": False, "post_id": None, "post_url": None, "error": "Threads user ID missing — please reconnect your account."}

    urls = [str(url).strip() for url in (media_urls or []) if str(url).strip()]
    if not urls and media_url:
        urls = [media_url]
    types = [str(kind or "image").strip().lower() for kind in (media_types or [])]
    if len(urls) > 20:
        return {"success": False, "post_id": None, "post_url": None, "error": "Threads carousels support a maximum of 20 media items."}

    client_timeout = httpx.Timeout(connect=20.0, read=60.0, write=60.0, pool=10.0)
    with httpx.Client(timeout=client_timeout) as client:
        if len(urls) > 1:
            children: list[str] = []
            for index, url in enumerate(urls):
                child_type = types[index] if index < len(types) else media_type
                child_params: dict[str, str] = {"is_carousel_item": "true", "access_token": access_token}
                is_video = child_type.startswith("video") or url.lower().split("?")[0].endswith((".mp4", ".mov", ".webm", ".m4v"))
                if is_video:
                    child_params.update({"media_type": "VIDEO", "video_url": url})
                else:
                    child_params.update({"media_type": "IMAGE", "image_url": url})
                child_resp = client.post(f"https://graph.threads.net/v1.0/{user_id}/threads", params=child_params)
                if child_resp.status_code >= 400:
                    err = (child_resp.json().get("error") or {}).get("message", child_resp.text[:200])
                    return {"success": False, "post_id": None, "post_url": None, "error": f"Threads carousel item error: {err}"}
                child_id = str(child_resp.json().get("id") or "").strip()
                if not child_id:
                    return {"success": False, "post_id": None, "post_url": None, "error": "Threads did not return a carousel item ID."}
                children.append(child_id)
            container_params: dict[str, str] = {"text": text, "media_type": "CAROUSEL", "children": ",".join(children), "access_token": access_token}
        else:
            chosen_url = urls[0] if urls else media_url
            is_video = bool(chosen_url) and (media_type.startswith("video") or chosen_url.lower().split("?")[0].endswith((".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv", ".flv", ".wmv")))
            container_params = {"text": text, "access_token": access_token, "media_type": "TEXT"}
            if chosen_url:
                if is_video:
                    container_params.update({"media_type": "VIDEO", "video_url": chosen_url})
                else:
                    container_params.update({"media_type": "IMAGE", "image_url": chosen_url})

        container_resp = client.post(f"https://graph.threads.net/v1.0/{user_id}/threads", params=container_params)
        if container_resp.status_code >= 400:
            err = (container_resp.json().get("error") or {}).get("message", container_resp.text[:200])
            return {"success": False, "post_id": None, "post_url": None, "error": f"Threads error: {err}"}
        creation_id = str(container_resp.json().get("id") or "").strip()
        if not creation_id:
            return {"success": False, "post_id": None, "post_url": None, "error": "Threads did not return a container ID."}

        if urls or media_url:
            for _ in range(12):
                status_resp = client.get(f"https://graph.threads.net/v1.0/{creation_id}", params={"fields": "status,error_message", "access_token": access_token})
                if status_resp.status_code >= 400:
                    break
                status_data = status_resp.json()
                container_status = str(status_data.get("status") or "").upper()
                if container_status == "FINISHED":
                    break
                if container_status == "ERROR":
                    err_msg = str(status_data.get("error_message") or "Container processing failed.")
                    return {"success": False, "post_id": None, "post_url": None, "error": f"Threads container error: {err_msg}"}
                sleep(5)

        publish_resp = client.post(f"https://graph.threads.net/v1.0/{user_id}/threads_publish", params={"creation_id": creation_id, "access_token": access_token})
        if publish_resp.status_code >= 400:
            err = (publish_resp.json().get("error") or {}).get("message", publish_resp.text[:200])
            return {"success": False, "post_id": None, "post_url": None, "error": f"Threads publish error: {err}"}

    post_id = publish_resp.json().get("id", "")
    return {"success": True, "post_id": post_id, "post_url": f"https://www.threads.net/t/{post_id}" if post_id else None, "error": None}

def _post_youtube_shorts(access_token: str, title_or_caption: str, media_url: str | None) -> PostResult:
    if not media_url:
        return {
            "success": False,
            "post_id": None,
            "post_url": None,
            "error": "YouTube Shorts requires a video URL.",
        }

    video_path = media_url.lower().split("?")[0]
    if not video_path.endswith((".mp4", ".mov", ".webm", ".m4v")):
        return {
            "success": False,
            "post_id": None,
            "post_url": None,
            "error": "YouTube Shorts supports video files only. Upload an MP4/MOV/WebM video.",
        }

    title = (title_or_caption or "Xcr8 Short").strip()[:100] or "Xcr8 Short"
    description = (title_or_caption or "").strip()[:5000]

    try:
        with httpx.Client(timeout=120.0) as client:
            media_resp = client.get(media_url)
            if media_resp.status_code >= 400:
                return {
                    "success": False,
                    "post_id": None,
                    "post_url": None,
                    "error": f"YouTube media download failed: {media_resp.status_code}",
                }

            media_bytes = media_resp.content
            content_type = media_resp.headers.get("content-type", "video/mp4")

            init_resp = client.post(
                "https://www.googleapis.com/upload/youtube/v3/videos",
                params={"uploadType": "resumable", "part": "snippet,status"},
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json; charset=UTF-8",
                    "X-Upload-Content-Type": content_type,
                    "X-Upload-Content-Length": str(len(media_bytes)),
                },
                json={
                    "snippet": {
                        "title": title,
                        "description": description,
                        "categoryId": "22",
                    },
                    "status": {
                        "privacyStatus": "public",
                        "selfDeclaredMadeForKids": False,
                    },
                },
            )
            if init_resp.status_code >= 400:
                detail = init_resp.text[:400]
                return {
                    "success": False,
                    "post_id": None,
                    "post_url": None,
                    "error": f"YouTube upload init failed: {detail}",
                }

            upload_url = init_resp.headers.get("Location")
            if not upload_url:
                return {
                    "success": False,
                    "post_id": None,
                    "post_url": None,
                    "error": "YouTube did not return resumable upload URL.",
                }

            put_resp = client.put(
                upload_url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": content_type,
                    "Content-Length": str(len(media_bytes)),
                },
                content=media_bytes,
            )
            if put_resp.status_code >= 400:
                return {
                    "success": False,
                    "post_id": None,
                    "post_url": None,
                    "error": f"YouTube upload failed: {put_resp.text[:400]}",
                }

            payload = put_resp.json() if put_resp.headers.get("content-type", "").startswith("application/json") else {}
            video_id = str(payload.get("id") or "").strip()
            return {
                "success": bool(video_id),
                "post_id": video_id or None,
                "post_url": f"https://www.youtube.com/watch?v={video_id}" if video_id else None,
                "error": None if video_id else "YouTube upload succeeded but no video ID was returned.",
            }
    except Exception as exc:
        return {
            "success": False,
            "post_id": None,
            "post_url": None,
            "error": f"YouTube Shorts publish error: {str(exc)[:300]}",
        }
