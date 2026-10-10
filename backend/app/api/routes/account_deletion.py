from __future__ import annotations

from datetime import UTC, datetime, timedelta
import uuid
import hmac
import logging
import os
from types import SimpleNamespace
from pathlib import Path
from typing import Literal
import tempfile
from urllib.parse import quote, unquote, urlparse

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import MetaData, Table, and_, delete, inspect, or_, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import (
    AccountDeletionJob,
    AIFeedback,
    AIGeneration,
    AcquisitionAttribution,
    AnalyticsSnapshot,
    AttributionVisit,
    AuthCredential,
    ConnectedPlatform,
    ContentPost,
    CreatorMemory,
    CreatorProfile,
    GrowthCampaign,
    GrowthEvent,
    InfluencerReferral,
    IntelligenceFeedback,
    IntelligenceNotification,
    PaymentEvent,
    PostVariant,
    PulseAffectedUser,
    PulseEvent,
    PulseNotification,
    ReferralCode,
    ReferralRelationship,
    ScheduledPost,
    TrendRecommendation,
    TrendResearchBrief,
    TrendSignalEvent,
    UsageAccount,
    UsageLedger,
    UsagePeriod,
    User,
    WatermarkLink,
    Workspace,
    WorkspaceMembership,
)
from app.services.account_deletion_recovery import decrypt_payload, encrypt_payload
from app.services.auth import (
    SupabaseAuthError,
    generate_signup_email_code,
    hash_signup_email_code,
    send_account_deletion_code,
    supabase_delete_user_by_email,
    verify_signup_email_code,
)
from app.services.current_user import current_user
from app.services.usage_cockpit import COOKIE

router = APIRouter(prefix="/account", tags=["account"])
logger = logging.getLogger(__name__)
_DELETE_CODE_KEY = "account_deletion_code_hash"
_DELETE_EXPIRY_KEY = "account_deletion_code_expires_at"
_DELETE_ATTEMPTS_KEY = "account_deletion_code_attempts"
_DELETE_REQUESTED_KEY = "account_deletion_code_requested_at"


class DeleteAccountRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    confirmation: Literal["DELETE"]


def _profile_preferences(profile: CreatorProfile) -> dict:
    return dict(profile.preferences) if isinstance(profile.preferences, dict) else {}


def _clear_deletion_challenge(profile: CreatorProfile) -> None:
    preferences = _profile_preferences(profile)
    for key in (_DELETE_CODE_KEY, _DELETE_EXPIRY_KEY, _DELETE_ATTEMPTS_KEY, _DELETE_REQUESTED_KEY):
        preferences.pop(key, None)
    profile.preferences = preferences


def _collect_media_urls(posts: list[ContentPost]) -> set[str]:
    urls: set[str] = set()
    for post in posts:
        for value in (post.media_url, post.thumbnail_url):
            if isinstance(value, str) and value.strip():
                urls.add(value.strip())
        metadata = post.content_meta if isinstance(post.content_meta, dict) else {}
        for key in ("media_urls", "thumbnail_url", "preview_url"):
            value = metadata.get(key)
            if isinstance(value, str) and value.strip():
                urls.add(value.strip())
            elif isinstance(value, list):
                urls.update(item.strip() for item in value if isinstance(item, str) and item.strip())
    return urls


def _delete_referenced_media(urls: set[str], extra_object_paths: set[str] | None = None) -> None:
    """Remove only media URLs that can be tied to XCR8's own configured storage."""
    base_url = str(settings.supabase_url or "").strip().rstrip("/")
    service_key = str(settings.supabase_service_role_key or "").strip()
    bucket = str(settings.storage_bucket or "xcr8-assets").strip() or "xcr8-assets"
    storage_host = urlparse(base_url).netloc.lower() if base_url else ""
    if not base_url and any("/storage/v1/object/public/" in urlparse(raw_url).path for raw_url in urls):
        raise HTTPException(
            status_code=503,
            detail="XCR8 could not verify its storage configuration. No account database records were deleted; please retry.",
        )
    object_paths: set[str] = {
        path.strip("/")
        for path in (extra_object_paths or set())
        if base_url
        and isinstance(path, str)
        and path.strip("/").startswith("uploads/")
        and not any(part == ".." for part in path.strip("/").split("/"))
    }
    local_paths: set[Path] = set()

    for raw_url in urls:
        parsed = urlparse(raw_url)
        if parsed.path.startswith("/api/v1/upload/"):
            filename = os.path.basename(unquote(parsed.path.rsplit("/", 1)[-1]))
            if filename and filename not in {".", ".."}:
                local_paths.add(Path(tempfile.gettempdir()) / "xcr8-uploads" / filename)
            continue
        if not storage_host or parsed.netloc.lower() != storage_host:
            continue
        prefix = f"/storage/v1/object/public/{bucket}/"
        if parsed.path.startswith(prefix):
            object_path = unquote(parsed.path[len(prefix):]).strip("/")
            if object_path and not any(part == ".." for part in object_path.split("/")):
                object_paths.add(object_path)

    # Local ephemeral uploads can be removed without an external dependency.
    for path in local_paths:
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            raise HTTPException(
                status_code=503,
                detail="XCR8 could not remove all local media. No account database records were deleted; please retry.",
            ) from exc

    if not object_paths:
        return
    if not base_url or not service_key:
        raise HTTPException(
            status_code=503,
            detail="Account deletion is paused because stored media could not be safely removed. Please try again later.",
        )

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=8.0) as client:
            response = client.post(
                f"{base_url}/storage/v1/object/{bucket}/remove",
                headers=headers,
                json={"prefixes": sorted(object_paths)},
            )
        if response.status_code >= 400:
            if response.status_code in {400, 404} and "not found" in response.text.lower():
                return
            logger.error("Storage cleanup failed with status %s", response.status_code)
            raise HTTPException(
                status_code=503,
                detail="XCR8 could not remove all stored media. No account database records were deleted; please retry.",
            )
    except HTTPException:
        raise
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail="XCR8 could not reach media storage. No account database records were deleted; please retry.",
        ) from exc





def _cancel_paystack_subscription(user: User) -> None:
    """Disable an active recurring Paystack subscription before account data is removed."""
    billing = user.billing_meta if isinstance(user.billing_meta, dict) else {}
    code = str(billing.get("paystack_subscription_code") or "").strip()
    local_status = str(billing.get("subscription_status") or "").strip().lower()
    if not code or local_status in {"disabled", "complete", "completed", "non-renewing", "cancelled", "canceled"}:
        return

    secret = str(settings.paystack_secret_key or "").strip()
    base_url = str(settings.paystack_base_url or "https://api.paystack.co").strip().rstrip("/")
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Your recurring subscription could not be checked or cancelled. No account data was deleted; contact support or retry later.",
        )

    headers = {"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=5.0) as client:
            fetched = client.get(f"{base_url}/subscription/{quote(code, safe='')}", headers=headers)
            if fetched.status_code >= 400:
                raise HTTPException(
                    status_code=503,
                    detail="XCR8 could not verify your recurring subscription. No account data was deleted; please retry.",
                )
            payload = fetched.json()
            subscription = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(payload, dict) or payload.get("status") is not True or not isinstance(subscription, dict):
                raise HTTPException(
                    status_code=503,
                    detail="XCR8 could not verify your recurring subscription. No account data was deleted; please retry.",
                )

            remote_status = str(subscription.get("status") or "").strip().lower()
            if remote_status in {"disabled", "complete", "completed", "non-renewing", "cancelled", "canceled"}:
                return
            if remote_status != "active":
                raise HTTPException(
                    status_code=503,
                    detail="XCR8 could not confirm the subscription's billing state. No account data was deleted; please retry.",
                )

            email_token = str(subscription.get("email_token") or "").strip()
            if not email_token:
                raise HTTPException(
                    status_code=503,
                    detail="XCR8 could not securely cancel your recurring subscription. No account data was deleted; please contact support.",
                )

            disabled = client.post(
                f"{base_url}/subscription/disable",
                headers=headers,
                json={"code": code, "token": email_token},
            )
            if disabled.status_code >= 400:
                raise HTTPException(
                    status_code=503,
                    detail="Paystack did not confirm subscription cancellation. No account data was deleted; please retry or contact support.",
                )
            result = disabled.json()
            if not isinstance(result, dict) or result.get("status") is not True:
                raise HTTPException(
                    status_code=503,
                    detail="Paystack did not confirm subscription cancellation. No account data was deleted; please retry or contact support.",
                )
    except HTTPException:
        raise
    except (httpx.RequestError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=503,
            detail="XCR8 could not safely confirm subscription cancellation. No account data was deleted; please retry.",
        ) from exc


def _revoke_external_platform_tokens(connections: list[tuple[str, dict]]) -> list[dict[str, str]]:
    """Best-effort provider revocation; local credential removal remains authoritative."""
    results: list[dict[str, str]] = []
    with httpx.Client(timeout=3.0) as client:
        for platform, auth_meta in connections:
            meta = auth_meta if isinstance(auth_meta, dict) else {}
            access_token = str(meta.get("access_token") or "").strip()
            refresh_token = str(meta.get("refresh_token") or "").strip()
            source_token = str(meta.get("source_user_access_token") or "").strip()
            token = source_token if platform in {"facebook", "instagram"} and source_token else access_token
            if not token or str(meta.get("connection_method") or "") == "manual":
                results.append({"platform": platform, "status": "no_oauth_token"})
                continue
            try:
                if platform in {"facebook", "instagram"}:
                    response = client.delete(
                        "https://graph.facebook.com/me/permissions",
                        params={"access_token": token},
                    )
                elif platform == "threads":
                    response = client.delete(
                        "https://graph.threads.net/v1.0/me/permissions",
                        params={"access_token": token},
                    )
                elif platform == "youtube_shorts":
                    response = client.post(
                        "https://oauth2.googleapis.com/revoke",
                        data={"token": refresh_token or token},
                    )
                elif platform == "x":
                    if not settings.twitter_client_id:
                        results.append({"platform": platform, "status": "not_confirmed"})
                        continue
                    response = client.post(
                        "https://api.x.com/2/oauth2/revoke",
                        data={
                            "client_id": settings.twitter_client_id,
                            "token": refresh_token or token,
                            "token_type_hint": "refresh_token" if refresh_token else "access_token",
                        },
                    )
                elif platform == "linkedin":
                    if not settings.linkedin_client_id or not settings.linkedin_client_secret:
                        results.append({"platform": platform, "status": "not_confirmed"})
                        continue
                    response = client.post(
                        "https://www.linkedin.com/oauth/v2/revoke",
                        data={
                            "client_id": settings.linkedin_client_id,
                            "client_secret": settings.linkedin_client_secret,
                            "token": refresh_token or token,
                        },
                    )
                elif platform == "tiktok":
                    if not settings.tiktok_client_key or not settings.tiktok_client_secret:
                        results.append({"platform": platform, "status": "not_confirmed"})
                        continue
                    response = client.post(
                        "https://open.tiktokapis.com/v2/oauth/revoke/",
                        json={
                            "client_key": settings.tiktok_client_key,
                            "client_secret": settings.tiktok_client_secret,
                            "token": refresh_token or token,
                        },
                    )
                else:
                    results.append({"platform": platform, "status": "not_supported"})
                    continue
                succeeded = 200 <= response.status_code < 300
                if succeeded and platform == "tiktok":
                    try:
                        provider_payload = response.json()
                        provider_error = provider_payload.get("error") if isinstance(provider_payload, dict) else None
                        if isinstance(provider_error, dict) and str(provider_error.get("code") or "ok").lower() not in {"", "ok"}:
                            succeeded = False
                    except ValueError:
                        succeeded = False
                results.append({
                    "platform": platform,
                    "status": "revoked" if succeeded else "not_confirmed",
                })
            except Exception:  # noqa: BLE001 - deletion continues even if a provider cannot revoke
                results.append({"platform": platform, "status": "not_confirmed"})
    return results



def _pending_platform_connections(
    connections: list[tuple[str, dict]], previous_results: list
) -> list[tuple[int, str, dict]]:
    """Retry revocation per saved connection, not per platform name.

    Older jobs stored only platform-level results. For those records, reuse a
    successful result only when that platform has exactly one saved connection;
    duplicate-platform connections must be retried because their old result
    cannot identify which credential was revoked.
    """
    platform_counts: dict[str, int] = {}
    for platform, _auth_meta in connections:
        platform_counts[platform] = platform_counts.get(platform, 0) + 1

    confirmed_indexes = {
        int(item["connection_index"])
        for item in previous_results
        if isinstance(item, dict)
        and item.get("status") in {"revoked", "no_oauth_token"}
        and str(item.get("connection_index", "")).isdigit()
    }
    legacy_confirmed_platforms = {
        str(item.get("platform"))
        for item in previous_results
        if isinstance(item, dict)
        and "connection_index" not in item
        and item.get("status") in {"revoked", "no_oauth_token"}
        and platform_counts.get(str(item.get("platform")), 0) == 1
    }

    return [
        (index, platform, auth_meta)
        for index, (platform, auth_meta) in enumerate(connections)
        if index not in confirmed_indexes and platform not in legacy_confirmed_platforms
    ]


def _payment_events_allow_detachment(db: Session) -> bool:
    """Require the accounting-preservation migration before deleting any account data."""
    try:
        columns = inspect(db.get_bind()).get_columns("payment_events")
    except Exception:  # noqa: BLE001 - unknown schema must fail closed
        return False
    return any(column.get("name") == "user_id" and column.get("nullable") is True for column in columns)


def _delete_unmapped_user_telemetry(db: Session, user_id: int) -> None:
    """Remove user-linked Pulse telemetry tables created by SQL migrations, not ORM models."""
    bind = db.get_bind()
    try:
        existing = set(inspect(bind).get_table_names())
        metadata = MetaData()
        # Child telemetry first; these tables intentionally do not own account identity.
        for name in ("pulse_ai_attempts", "pulse_value_events", "pulse_ai_requests"):
            if name not in existing:
                continue
            table = Table(name, metadata, autoload_with=bind)
            if "user_id" in table.c:
                db.execute(delete(table).where(table.c.user_id == user_id))
    except Exception as exc:
        logger.exception("Could not inspect or remove user-linked Pulse telemetry")
        raise HTTPException(
            status_code=503,
            detail="Account deletion paused because user-linked usage telemetry could not be safely removed.",
        ) from exc


def _delete_local_account_data(db: Session, user: User) -> dict:
    user_id = user.id
    posts = list(db.scalars(select(ContentPost).where(ContentPost.user_id == user_id)).all())
    post_ids = [post.id for post in posts]
    media_urls = _collect_media_urls(posts)
    usage_rows = list(db.scalars(select(UsageLedger).where(UsageLedger.user_id == user_id)).all())
    upload_object_paths = {
        str((row.event_meta or {}).get("object_path") or "").strip()
        for row in usage_rows
        if isinstance(row.event_meta, dict)
        and str((row.event_meta or {}).get("object_path") or "").strip()
    }
    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user_id))
    profile_preferences = profile.preferences if profile and isinstance(profile.preferences, dict) else {}
    avatar_url = profile_preferences.get("avatar_url")
    if isinstance(avatar_url, str) and avatar_url.strip():
        media_urls.add(avatar_url.strip())
    trend_ids = list(db.scalars(select(TrendSignalEvent.id).where(TrendSignalEvent.user_id == user_id)).all())
    watermark_ids = list(db.scalars(select(WatermarkLink.id).where(WatermarkLink.creator_user_id == user_id)).all())
    referral_codes = list(db.scalars(select(ReferralCode.code).where(ReferralCode.owner_user_id == user_id)).all())

    # Preserve workspaces shared with other creators; transfer ownership when needed.
    memberships = list(db.scalars(select(WorkspaceMembership).where(WorkspaceMembership.user_id == user_id)).all())
    empty_workspace_ids: list[int] = []
    for membership in memberships:
        others = list(
            db.scalars(
                select(WorkspaceMembership)
                .where(
                    WorkspaceMembership.workspace_id == membership.workspace_id,
                    WorkspaceMembership.user_id != user_id,
                )
                .order_by(WorkspaceMembership.created_at.asc(), WorkspaceMembership.id.asc())
            ).all()
        )
        if membership.is_owner and others:
            if not any(other.is_owner for other in others):
                others[0].is_owner = True
                others[0].role = "owner"
        elif not others:
            empty_workspace_ids.append(membership.workspace_id)

    workspace_filter = (
        or_(
            ContentPost.workspace_id.in_(empty_workspace_ids),
            ContentPost.user_id == user_id,
        )
        if empty_workspace_ids
        else ContentPost.user_id == user_id
    )
    if empty_workspace_ids:
        post_ids = list(
            set(post_ids)
            | set(db.scalars(select(ContentPost.id).where(ContentPost.workspace_id.in_(empty_workspace_ids))).all())
        )
        trend_ids = list(
            set(trend_ids)
            | set(db.scalars(select(TrendSignalEvent.id).where(TrendSignalEvent.workspace_id.in_(empty_workspace_ids))).all())
        )
        watermark_ids = list(
            set(watermark_ids)
            | set(db.scalars(select(WatermarkLink.id).where(WatermarkLink.content_post_id.in_(post_ids))).all())
        )
        workspace_media_posts = list(
            db.scalars(select(ContentPost).where(ContentPost.workspace_id.in_(empty_workspace_ids))).all()
        )
        media_urls.update(_collect_media_urls(workspace_media_posts))

    # Remove visits tied to personal referral/watermark links before those links go away.
    visit_filters = []
    if watermark_ids:
        visit_filters.append(AttributionVisit.watermark_id.in_(watermark_ids))
    if referral_codes:
        visit_filters.append(AttributionVisit.referral_code.in_(referral_codes))
    if visit_filters:
        db.execute(delete(AttributionVisit).where(or_(*visit_filters)))

    # Remove user-specific growth associations, but keep shared campaigns/referral records.
    db.execute(
        delete(GrowthEvent).where(
            or_(
                GrowthEvent.user_id == user_id,
                GrowthEvent.referrer_user_id == user_id,
                GrowthEvent.watermark_id.in_(watermark_ids) if watermark_ids else False,
                GrowthEvent.referral_code.in_(referral_codes) if referral_codes else False,
            )
        )
    )
    db.execute(
        delete(ReferralRelationship).where(
            or_(ReferralRelationship.referrer_user_id == user_id, ReferralRelationship.referred_user_id == user_id)
        )
    )
    db.execute(delete(AcquisitionAttribution).where(AcquisitionAttribution.user_id == user_id))
    db.execute(delete(ReferralCode).where(ReferralCode.owner_user_id == user_id))
    db.execute(update(GrowthCampaign).where(GrowthCampaign.created_by_user_id == user_id).values(created_by_user_id=None))
    db.execute(
        update(InfluencerReferral)
        .where(InfluencerReferral.created_by_user_id == user_id)
        .values(created_by_user_id=None)
    )

    _delete_unmapped_user_telemetry(db, user_id)

    # Financial payment events are retained for accounting, but detached from the account.
    db.execute(update(PaymentEvent).where(PaymentEvent.user_id == user_id).values(user_id=None))

    # Delete dependent content before parent records to respect foreign-key constraints.
    if post_ids:
        db.execute(delete(PostVariant).where(PostVariant.post_id.in_(post_ids)))
        db.execute(delete(AIGeneration).where(AIGeneration.post_id.in_(post_ids)))
        db.execute(delete(ScheduledPost).where(ScheduledPost.post_id.in_(post_ids)))
        db.execute(delete(WatermarkLink).where(WatermarkLink.content_post_id.in_(post_ids)))
    if trend_ids:
        db.execute(delete(TrendResearchBrief).where(TrendResearchBrief.trend_signal_id.in_(trend_ids)))
        db.execute(delete(TrendRecommendation).where(TrendRecommendation.trend_signal_id.in_(trend_ids)))
        db.execute(delete(IntelligenceFeedback).where(IntelligenceFeedback.trend_signal_id.in_(trend_ids)))

    db.execute(delete(ScheduledPost).where(or_(ScheduledPost.user_id == user_id, ScheduledPost.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(ScheduledPost).where(ScheduledPost.user_id == user_id))
    db.execute(delete(ContentPost).where(workspace_filter))
    db.execute(delete(WatermarkLink).where(or_(WatermarkLink.creator_user_id == user_id, WatermarkLink.content_post_id.in_(post_ids) if post_ids else False)))
    db.execute(delete(ConnectedPlatform).where(or_(ConnectedPlatform.user_id == user_id, ConnectedPlatform.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(ConnectedPlatform).where(ConnectedPlatform.user_id == user_id))
    db.execute(delete(CreatorMemory).where(or_(CreatorMemory.user_id == user_id, CreatorMemory.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(CreatorMemory).where(CreatorMemory.user_id == user_id))
    db.execute(delete(AnalyticsSnapshot).where(or_(AnalyticsSnapshot.user_id == user_id, AnalyticsSnapshot.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(AnalyticsSnapshot).where(AnalyticsSnapshot.user_id == user_id))
    db.execute(delete(TrendSignalEvent).where(or_(TrendSignalEvent.user_id == user_id, TrendSignalEvent.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(TrendSignalEvent).where(TrendSignalEvent.user_id == user_id))
    db.execute(delete(IntelligenceFeedback).where(IntelligenceFeedback.user_id == user_id))
    db.execute(delete(IntelligenceNotification).where(or_(IntelligenceNotification.user_id == user_id, IntelligenceNotification.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(IntelligenceNotification).where(IntelligenceNotification.user_id == user_id))
    db.execute(delete(AIFeedback).where(AIFeedback.user_id == user_id))
    db.execute(delete(AuthCredential).where(AuthCredential.user_id == user_id))
    db.execute(delete(CreatorProfile).where(CreatorProfile.user_id == user_id))
    db.execute(delete(UsagePeriod).where(UsagePeriod.user_id == user_id))
    db.execute(delete(UsageAccount).where(UsageAccount.user_id == user_id))
    db.execute(delete(UsageLedger).where(or_(UsageLedger.user_id == user_id, UsageLedger.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(UsageLedger).where(UsageLedger.user_id == user_id))
    db.execute(delete(PulseEvent).where(or_(PulseEvent.user_id == user_id, PulseEvent.affected_user_email == user.email)))
    db.execute(delete(PulseAffectedUser).where(or_(PulseAffectedUser.user_id == user_id, PulseAffectedUser.email == user.email)))
    db.execute(delete(PulseNotification).where(PulseNotification.target == user.email))
    db.execute(delete(WorkspaceMembership).where(WorkspaceMembership.user_id == user_id))
    if empty_workspace_ids:
        # Only delete workspace records after all data tied to the now-empty workspaces is removed.
        db.execute(delete(WorkspaceMembership).where(WorkspaceMembership.workspace_id.in_(empty_workspace_ids)))
        db.execute(delete(Workspace).where(Workspace.id.in_(empty_workspace_ids)))

    db.delete(user)
    # Flush every local deletion first so foreign-key/schema failures happen before
    # external storage is changed. A storage failure still rolls back this transaction.
    db.flush()
    return {"media_urls": sorted(media_urls), "upload_object_paths": sorted(upload_object_paths)}


@router.post("/deletion/request")
def request_account_deletion_code(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> dict:
    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    if profile is None:
        profile = CreatorProfile(user_id=user.id, preferences={})
        db.add(profile)
        db.flush()

    preferences = _profile_preferences(profile)
    now = datetime.now(UTC)
    requested_at = preferences.get(_DELETE_REQUESTED_KEY)
    if requested_at:
        try:
            last_request = datetime.fromisoformat(str(requested_at).replace("Z", "+00:00"))
            if last_request.tzinfo is None:
                last_request = last_request.replace(tzinfo=UTC)
            if now - last_request < timedelta(seconds=60):
                raise HTTPException(status_code=429, detail="Please wait 60 seconds before requesting another code.")
        except ValueError:
            pass

    code = generate_signup_email_code()
    preferences[_DELETE_CODE_KEY] = hash_signup_email_code(user.email, code)
    preferences[_DELETE_EXPIRY_KEY] = (now + timedelta(minutes=max(1, int(settings.signup_code_ttl_minutes)))).isoformat()
    preferences[_DELETE_ATTEMPTS_KEY] = 0
    preferences[_DELETE_REQUESTED_KEY] = now.isoformat()
    profile.preferences = preferences
    db.commit()

    try:
        send_account_deletion_code(user.email, code)
    except SupabaseAuthError as exc:
        _clear_deletion_challenge(profile)
        db.commit()
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return {
        "message": "A confirmation code has been sent to the email address on your XCR8 account.",
        "expires_in_minutes": max(1, int(settings.signup_code_ttl_minutes)),
    }


def _job_stage_complete(job: AccountDeletionJob, stage: str) -> bool:
    results = job.stage_results if isinstance(job.stage_results, dict) else {}
    result = results.get(stage)
    return isinstance(result, dict) and result.get("status") == "completed"


def _store_job_stage(db: Session, job: AccountDeletionJob, stage: str, result: dict) -> None:
    results = dict(job.stage_results) if isinstance(job.stage_results, dict) else {}
    results[stage] = result
    job.stage_results = results
    job.current_stage = stage
    job.updated_at = datetime.now(UTC)
    db.add(job)
    db.commit()
    db.refresh(job)


def _finish_job_failure(db: Session, job: AccountDeletionJob, stage: str, error: Exception) -> None:
    now = datetime.now(UTC)
    job.current_stage = stage
    job.last_error_code = type(error).__name__[:64]
    # Do not persist provider responses, tokens, email addresses, or exception text.
    job.last_error_message = "A required deletion cleanup step did not complete."
    job.lease_expires_at = None
    if job.attempt_count >= 8:
        job.status = "manual_review"
        job.next_attempt_at = None
    else:
        job.status = "retry_pending"
        job.next_attempt_at = now + timedelta(minutes=min(1440, 2 ** min(job.attempt_count, 10)))
    job.updated_at = now
    db.add(job)
    db.commit()


def _process_deletion_job(db: Session, job: AccountDeletionJob) -> dict:
    now = datetime.now(UTC)
    if job.payload_expires_at and now >= job.payload_expires_at:
        job.recovery_payload_encrypted = None
        job.status = "manual_review"
        job.lease_expires_at = None
        job.next_attempt_at = None
        job.last_error_code = "recovery_payload_expired"
        job.last_error_message = "Encrypted recovery data expired before all cleanup steps were confirmed."
        db.commit()
        return {"status": job.status, "job_id": job.id, "local_data_deleted": True}

    if not job.recovery_payload_encrypted:
        job.status = "manual_review"
        job.lease_expires_at = None
        job.next_attempt_at = None
        job.last_error_code = "recovery_payload_missing"
        job.last_error_message = "Recovery data is unavailable; manual review is required."
        db.commit()
        return {"status": job.status, "job_id": job.id, "local_data_deleted": True}

    job.status = "processing"
    job.attempt_count = int(job.attempt_count or 0) + 1
    job.last_attempt_at = now
    job.lease_expires_at = now + timedelta(minutes=5)
    job.updated_at = now
    db.commit()
    db.refresh(job)

    try:
        recovery = decrypt_payload(job.recovery_payload_encrypted)
    except Exception as exc:
        _finish_job_failure(db, job, "decrypt_recovery_payload", exc)
        return {"status": job.status, "job_id": job.id, "local_data_deleted": True}

    try:
        if not _job_stage_complete(job, "paystack_cancellation"):
            job.current_stage = "paystack_cancellation"
            job.updated_at = datetime.now(UTC)
            db.commit()
            db.refresh(job)
            billing_meta = recovery.get("billing_meta")
            _cancel_paystack_subscription(SimpleNamespace(
                billing_meta=billing_meta if isinstance(billing_meta, dict) else {}
            ))
            _store_job_stage(db, job, "paystack_cancellation", {"status": "completed"})

        if not _job_stage_complete(job, "media_cleanup"):
            job.current_stage = "media_cleanup"
            job.updated_at = datetime.now(UTC)
            db.commit()
            db.refresh(job)
            media_urls = recovery.get("media_urls")
            object_paths = recovery.get("upload_object_paths")
            _delete_referenced_media(
                {item for item in media_urls if isinstance(item, str)} if isinstance(media_urls, list) else set(),
                {item for item in object_paths if isinstance(item, str)} if isinstance(object_paths, list) else set(),
            )
            _store_job_stage(db, job, "media_cleanup", {"status": "completed"})

        if not _job_stage_complete(job, "supabase_identity"):
            job.current_stage = "supabase_identity"
            job.updated_at = datetime.now(UTC)
            db.commit()
            db.refresh(job)
            email = str(recovery.get("email") or "").strip()
            if not email:
                raise RuntimeError("Missing identity recovery reference")
            # This helper is idempotent: a missing identity is treated as already removed.
            supabase_delete_user_by_email(email)
            _store_job_stage(db, job, "supabase_identity", {"status": "completed"})

        results = job.stage_results if isinstance(job.stage_results, dict) else {}
        previous = results.get("platform_revocation")
        if not isinstance(previous, dict) or previous.get("status") != "completed":
            job.current_stage = "platform_revocation"
            job.updated_at = datetime.now(UTC)
            db.commit()
            db.refresh(job)
            raw_connections = recovery.get("connections")
            connections: list[tuple[str, dict]] = []
            if isinstance(raw_connections, list):
                for item in raw_connections:
                    if isinstance(item, dict):
                        platform = str(item.get("platform") or "").strip()
                        auth_meta = item.get("auth_meta")
                        if platform and isinstance(auth_meta, dict):
                            connections.append((platform, auth_meta))
            previous_results = previous.get("results", []) if isinstance(previous, dict) else []
            pending = _pending_platform_connections(connections, previous_results)
            latest: list[dict[str, str]] = []
            for connection_index, platform, auth_meta in pending:
                for result in _revoke_external_platform_tokens([(platform, auth_meta)]):
                    # Store only the position in the encrypted recovery snapshot, never credentials.
                    latest.append({**result, "connection_index": str(connection_index)})
            combined = [
                item for item in previous_results
                if isinstance(item, dict) and item.get("status") in {"revoked", "no_oauth_token"}
            ] + latest
            all_confirmed = all(
                item.get("status") in {"revoked", "no_oauth_token"}
                for item in combined
            )
            _store_job_stage(
                db, job, "platform_revocation",
                {"status": "completed" if all_confirmed else "pending", "results": combined},
            )
            if not all_confirmed:
                raise RuntimeError("External platform revocation needs retry or manual review")

        job.status = "completed"
        job.current_stage = "completed"
        job.completed_at = datetime.now(UTC)
        job.lease_expires_at = None
        job.next_attempt_at = None
        job.recovery_payload_encrypted = None
        job.last_error_code = None
        job.last_error_message = None
        db.add(job)
        db.commit()
    except Exception as exc:
        db.rollback()
        job = db.get(AccountDeletionJob, job.id)
        if job is None:
            logger.error("Account deletion job disappeared during processing")
            return {"status": "manual_review", "local_data_deleted": True}
        _finish_job_failure(db, job, job.current_stage or "unknown", exc)

    revocation = (job.stage_results or {}).get("platform_revocation", {}) if isinstance(job.stage_results, dict) else {}
    revocation_results = revocation.get("results", []) if isinstance(revocation, dict) else []
    return {
        "status": job.status,
        "job_id": job.id,
        "local_data_deleted": True,
        "platforms_needing_manual_review": [
            str(item.get("platform")) for item in revocation_results
            if isinstance(item, dict) and item.get("status") not in {"revoked", "no_oauth_token"}
        ],
    }


def _authorize_deletion_cron(authorization: str | None) -> None:
    secret = str(settings.cron_secret or "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Deletion recovery is not configured.")
    if not authorization or not hmac.compare_digest(authorization, f"Bearer {secret}"):
        raise HTTPException(status_code=401, detail="Unauthorized deletion-recovery request.")


@router.post("/deletion/process-pending")
def process_pending_account_deletions(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    _authorize_deletion_cron(authorization)
    now = datetime.now(UTC)
    # Purge encrypted recovery secrets after the bounded 30-day retention window,
    # including jobs that have already reached manual review.
    expired_manual_jobs = list(db.scalars(
        select(AccountDeletionJob).where(
            AccountDeletionJob.status == "manual_review",
            AccountDeletionJob.payload_expires_at <= now,
            AccountDeletionJob.recovery_payload_encrypted.is_not(None),
        )
    ).all())
    for expired_job in expired_manual_jobs:
        expired_job.recovery_payload_encrypted = None
        expired_job.updated_at = now
    if expired_manual_jobs:
        db.commit()

    jobs = list(db.scalars(
        select(AccountDeletionJob)
        .where(
            or_(
                AccountDeletionJob.status.in_(["requested", "retry_pending"]),
                and_(
                    AccountDeletionJob.status == "processing",
                    AccountDeletionJob.lease_expires_at <= now,
                ),
            ),
            or_(AccountDeletionJob.next_attempt_at.is_(None), AccountDeletionJob.next_attempt_at <= now),
        )
        .order_by(AccountDeletionJob.created_at.asc())
        .limit(10)
        .with_for_update(skip_locked=True)
    ).all())
    for job in jobs:
        job.status = "processing"
        job.lease_expires_at = now + timedelta(minutes=5)
        job.updated_at = now
    db.commit()

    results = [_process_deletion_job(db, job) for job in jobs]
    return {"processed": len(results), "results": results}


@router.post("/deletion")
def delete_account(
    payload: DeleteAccountRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> dict:
    if payload.confirmation != "DELETE":
        raise HTTPException(status_code=400, detail='Type "DELETE" to confirm permanent account deletion.')

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    preferences = _profile_preferences(profile) if profile else {}
    stored_hash = str(preferences.get(_DELETE_CODE_KEY) or "")
    expires_raw = str(preferences.get(_DELETE_EXPIRY_KEY) or "")
    attempts = int(preferences.get(_DELETE_ATTEMPTS_KEY) or 0)
    if not profile or not stored_hash or not expires_raw:
        raise HTTPException(status_code=400, detail="Request an account-deletion code first.")

    if attempts >= 5:
        _clear_deletion_challenge(profile)
        db.commit()
        raise HTTPException(status_code=429, detail="Too many incorrect codes. Request a new confirmation code.")

    try:
        expires_at = datetime.fromisoformat(expires_raw.replace("Z", "+00:00"))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
    except ValueError:
        expires_at = datetime.min.replace(tzinfo=UTC)

    if datetime.now(UTC) >= expires_at:
        _clear_deletion_challenge(profile)
        db.commit()
        raise HTTPException(status_code=400, detail="The confirmation code has expired. Request a new one.")

    if not verify_signup_email_code(user.email, payload.code, stored_hash):
        preferences[_DELETE_ATTEMPTS_KEY] = attempts + 1
        profile.preferences = preferences
        db.commit()
        raise HTTPException(status_code=400, detail="Incorrect confirmation code.")

    if not _payment_events_allow_detachment(db):
        raise HTTPException(
            status_code=503,
            detail="The account-deletion database migration is not applied. No account data was deleted; please retry later.",
        )

    try:
        connections = [
            {
                "platform": row.platform.value if hasattr(row.platform, "value") else str(row.platform),
                "auth_meta": {
                    key: (row.auth_meta or {}).get(key)
                    for key in ("access_token", "refresh_token", "source_user_access_token", "connection_method")
                    if isinstance(row.auth_meta, dict) and (row.auth_meta or {}).get(key) is not None
                },
            }
            for row in db.scalars(
                select(ConnectedPlatform).where(ConnectedPlatform.user_id == user.id)
            ).all()
        ]
        billing_meta = user.billing_meta if isinstance(user.billing_meta, dict) else {}
        # Keep only the fields needed to verify/cancel recurring billing.
        recovery_billing_meta = {
            "paystack_subscription_code": str(billing_meta.get("paystack_subscription_code") or ""),
            "subscription_status": str(billing_meta.get("subscription_status") or ""),
        }
        resources = _delete_local_account_data(db, user)
        recovery_payload = {
            "email": user.email,
            "billing_meta": recovery_billing_meta,
            "connections": connections,
            "media_urls": resources["media_urls"],
            "upload_object_paths": resources["upload_object_paths"],
        }
        job = AccountDeletionJob(
            id=str(uuid.uuid4()),
            user_id=user.id,
            status="requested",
            current_stage="queued",
            attempt_count=0,
            payload_expires_at=datetime.now(UTC) + timedelta(days=30),
            recovery_payload_encrypted=encrypt_payload(recovery_payload),
            stage_results={},
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(job)
        # The local deletion and recovery record commit together. External cleanup
        # begins only after the durable record exists.
        db.commit()
        db.refresh(job)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Account deletion request could not be durably recorded")
        raise HTTPException(
            status_code=503,
            detail="Account deletion could not be safely recorded. No account data was deleted; please retry.",
        ) from exc

    response.delete_cookie(
        COOKIE,
        path="/",
        httponly=True,
        secure=request.url.scheme == "https" or os.getenv("ENVIRONMENT") == "production",
        samesite="lax",
    )
    result = _process_deletion_job(db, job)
    revocation = (job.stage_results or {}).get("platform_revocation", {}) if isinstance(job.stage_results, dict) else {}
    return {
        "deleted": True,
        "message": (
            "Your XCR8 account data has been deleted."
            if result.get("status") == "completed"
            else "Your XCR8 account data has been deleted. Some external cleanup is still being retried."
        ),
        "deletion_job": result,
        "external_platform_revocation": revocation.get("results", []) if isinstance(revocation, dict) else [],
    }
