from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
from time import time
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
        "scopes": "instagram_basic,instagram_content_publish,pages_show_list",
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
        "scopes": "threads_basic,threads_content_publish",
        "cred_keys": ("threads_app_id", "threads_app_secret"),
    },
}


def _platform_creds(platform: str) -> tuple[str, str]:
    cfg = _PLATFORM_OAUTH.get(platform, {})
    client_id_key, secret_key = cfg.get("cred_keys", ("", ""))
    return (
        str(getattr(settings, client_id_key, "") or "").strip(),
        str(getattr(settings, secret_key, "") or "").strip(),
    )


def is_platform_configured(platform: str) -> bool:
    client_id, _ = _platform_creds(platform)
    return bool(client_id.strip())


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
                # Threads OAuth token exchange expects form-encoded POST.
                response = client.post(
                    cfg["token_url"],
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    data=data,
                )
            else:
                response = client.post(
                    cfg["token_url"],
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    data=data,
                )

        if response.status_code >= 400:
            logger.warning(
                "Token exchange failed %s: %s %s",
                platform, response.status_code, response.text[:300],
            )
            return None
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

        pages = response.json().get("data", [])
        if not isinstance(pages, list) or not pages:
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


def fetch_instagram_business_connection(user_access_token: str) -> dict[str, str] | None:
    """Resolve an Instagram business account + page access token from a Meta user token."""
    try:
        with httpx.Client(timeout=12.0) as client:
            response = client.get(
                "https://graph.facebook.com/v19.0/me/accounts",
                params={
                    "access_token": user_access_token,
                    "fields": "id,name,access_token,instagram_business_account{id,username}",
                    "limit": 25,
                },
            )

        if response.status_code >= 400:
            logger.warning(
                "Instagram account lookup failed: %s %s",
                response.status_code,
                response.text[:300],
            )
            return None

        pages = response.json().get("data", [])
        if not isinstance(pages, list) or not pages:
            return None

        selected: dict[str, Any] | None = None
        for page in pages:
            if not isinstance(page, dict):
                continue
            page_token = str(page.get("access_token") or "").strip()
            ig = page.get("instagram_business_account") or {}
            ig_id = str((ig or {}).get("id") or "").strip() if isinstance(ig, dict) else ""
            if page_token and ig_id:
                selected = page
                break

        if not selected:
            return None

        ig = selected.get("instagram_business_account") or {}
        return {
            "ig_user_id": str((ig or {}).get("id") or "").strip(),
            "ig_username": str((ig or {}).get("username") or "").strip(),
            "page_id": str(selected.get("id") or "").strip(),
            "page_name": str(selected.get("name") or "").strip(),
            "page_access_token": str(selected.get("access_token") or "").strip(),
        }
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
) -> PostResult:
    try:
        if platform == "x":
            return _post_twitter(access_token, caption, media_url)
        elif platform == "instagram":
            return _post_instagram(access_token, caption, media_url, platform_user_id)
        elif platform == "facebook":
            return _post_facebook(access_token, caption, media_url, platform_user_id)
        elif platform == "linkedin":
            return _post_linkedin(access_token, caption, media_url, platform_user_id)
        elif platform == "threads":
            return _post_threads(access_token, caption, media_url, platform_user_id)
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
            return {
                "success": False,
                "post_id": None,
                "post_url": None,
                "error": (
                    "YouTube Shorts publishing requires video file upload via the YouTube Data API. "
                    "Use YouTube Studio or the YouTube mobile app to post Shorts directly."
                ),
            }
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
    access_token: str, caption: str, image_url: str | None, ig_user_id: str | None
) -> PostResult:
    if not ig_user_id:
        return {"success": False, "post_id": None, "post_url": None, "error": "Instagram user ID missing — please reconnect your account."}
    if not image_url:
        return {"success": False, "post_id": None, "post_url": None, "error": "Instagram requires an image or video URL."}

    with httpx.Client(timeout=30.0) as client:
        container_resp = client.post(
            f"https://graph.facebook.com/v19.0/{ig_user_id}/media",
            params={"image_url": image_url, "caption": caption, "access_token": access_token},
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
    access_token: str, message: str, media_url: str | None, page_id: str | None
) -> PostResult:
    if not page_id:
        return {"success": False, "post_id": None, "post_url": None, "error": "Facebook Page ID missing — please reconnect your account."}

    params: dict[str, str] = {"message": message, "access_token": access_token}
    if media_url:
        params["link"] = media_url

    with httpx.Client(timeout=20.0) as client:
        response = client.post(f"https://graph.facebook.com/v19.0/{page_id}/feed", data=params)

    if response.status_code in (200, 201):
        post_id = response.json().get("id", "")
        page_post_url = (
            f"https://facebook.com/{post_id.replace('_', '/posts/')}"
            if "_" in post_id
            else None
        )
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
    access_token: str, text: str, media_url: str | None, user_id: str | None
) -> PostResult:
    if not user_id:
        return {"success": False, "post_id": None, "post_url": None, "error": "Threads user ID missing — please reconnect your account."}

    container_params: dict[str, str] = {
        "text": text,
        "access_token": access_token,
        "media_type": "TEXT",
    }
    if media_url:
        container_params["media_type"] = "IMAGE"
        container_params["image_url"] = media_url

    with httpx.Client(timeout=30.0) as client:
        container_resp = client.post(
            f"https://graph.threads.net/v1.0/{user_id}/threads",
            params=container_params,
        )
        if container_resp.status_code >= 400:
            err = (container_resp.json().get("error") or {}).get("message", container_resp.text[:200])
            return {"success": False, "post_id": None, "post_url": None, "error": f"Threads error: {err}"}

        creation_id = container_resp.json().get("id")
        if not creation_id:
            return {"success": False, "post_id": None, "post_url": None, "error": "Threads did not return a container ID."}

        publish_resp = client.post(
            f"https://graph.threads.net/v1.0/{user_id}/threads_publish",
            params={"creation_id": creation_id, "access_token": access_token},
        )
        if publish_resp.status_code >= 400:
            err = (publish_resp.json().get("error") or {}).get("message", publish_resp.text[:200])
            return {"success": False, "post_id": None, "post_url": None, "error": f"Threads publish error: {err}"}

    post_id = publish_resp.json().get("id", "")
    return {
        "success": True,
        "post_id": post_id,
        "post_url": f"https://www.threads.net/t/{post_id}" if post_id else None,
        "error": None,
    }
