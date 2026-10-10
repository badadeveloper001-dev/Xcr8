from __future__ import annotations

from datetime import UTC, datetime, timedelta
import logging
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import unquote, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import (
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
from app.services.auth import (
    SupabaseAuthError,
    generate_signup_email_code,
    hash_signup_email_code,
    send_account_deletion_code,
    supabase_delete_user_by_email,
    verify_signup_email_code,
)
from app.services.current_user import current_user

router = APIRouter(prefix="/account", tags=["account"])
logger = logging.getLogger(__name__)
_DELETE_CODE_KEY = "account_deletion_code_hash"
_DELETE_EXPIRY_KEY = "account_deletion_code_expires_at"
_DELETE_ATTEMPTS_KEY = "account_deletion_code_attempts"
_DELETE_REQUESTED_KEY = "account_deletion_code_requested_at"


class DeleteAccountRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    confirmation: str = Field(min_length=6, max_length=6)


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


def _delete_referenced_media(urls: set[str]) -> None:
    """Remove only media URLs that can be tied to XCR8's own configured storage."""
    base_url = str(settings.supabase_url or "").strip().rstrip("/")
    service_key = str(settings.supabase_service_role_key or "").strip()
    bucket = str(settings.storage_bucket or "xcr8-assets").strip() or "xcr8-assets"
    storage_host = urlparse(base_url).netloc.lower() if base_url else ""
    object_paths: set[str] = set()
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
            logger.warning("Could not remove local account media %s: %s", path.name, exc)

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
        with httpx.Client(timeout=20.0) as client:
            response = client.post(
                f"{base_url}/storage/v1/object/{bucket}/remove",
                headers=headers,
                json={"prefixes": sorted(object_paths)},
            )
        if response.status_code >= 400:
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


def _delete_local_account_data(db: Session, user: User) -> None:
    user_id = user.id
    posts = list(db.scalars(select(ContentPost).where(ContentPost.user_id == user_id)).all())
    post_ids = [post.id for post in posts]
    media_urls = _collect_media_urls(posts)
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

    # Remove storage objects before mutating database rows. If this fails, the account
    # remains intact and the user can retry from the same authenticated session.
    _delete_referenced_media(media_urls)

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
    db.execute(
        update(ReferralCode)
        .where(ReferralCode.owner_user_id == user_id)
        .values(owner_user_id=None, active=False)
    )
    db.execute(update(GrowthCampaign).where(GrowthCampaign.created_by_user_id == user_id).values(created_by_user_id=None))
    db.execute(
        update(InfluencerReferral)
        .where(InfluencerReferral.created_by_user_id == user_id)
        .values(created_by_user_id=None)
    )

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

    db.execute(delete(PostVariant).where(PostVariant.post_id.in_(post_ids)) if post_ids else delete(PostVariant).where(False))
    db.execute(delete(ScheduledPost).where(or_(ScheduledPost.user_id == user_id, ScheduledPost.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(ScheduledPost).where(ScheduledPost.user_id == user_id))
    db.execute(delete(AIGeneration).where(AIGeneration.post_id.in_(post_ids)) if post_ids else delete(AIGeneration).where(False))
    db.execute(delete(ContentPost).where(workspace_filter))
    db.execute(delete(WatermarkLink).where(or_(WatermarkLink.creator_user_id == user_id, WatermarkLink.content_post_id.in_(post_ids) if post_ids else False)))
    db.execute(delete(ConnectedPlatform).where(or_(ConnectedPlatform.user_id == user_id, ConnectedPlatform.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(ConnectedPlatform).where(ConnectedPlatform.user_id == user_id))
    db.execute(delete(CreatorMemory).where(or_(CreatorMemory.user_id == user_id, CreatorMemory.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(CreatorMemory).where(CreatorMemory.user_id == user_id))
    db.execute(delete(AnalyticsSnapshot).where(or_(AnalyticsSnapshot.user_id == user_id, AnalyticsSnapshot.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(AnalyticsSnapshot).where(AnalyticsSnapshot.user_id == user_id))
    db.execute(delete(TrendSignalEvent).where(or_(TrendSignalEvent.user_id == user_id, TrendSignalEvent.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(TrendSignalEvent).where(TrendSignalEvent.user_id == user_id))
    db.execute(delete(IntelligenceFeedback).where(IntelligenceFeedback.user_id == user_id))
    db.execute(delete(IntelligenceNotification).where(or_(IntelligenceNotification.user_id == user_id, IntelligenceNotification.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(IntelligenceNotification).where(IntelligenceNotification.user_id == user_id))
    db.execute(delete(AIFeedback).where(AIFeedback.user_id == user_id))
    db.execute(delete(UsagePeriod).where(UsagePeriod.user_id == user_id))
    db.execute(delete(UsageAccount).where(UsageAccount.user_id == user_id))
    db.execute(delete(UsageLedger).where(or_(UsageLedger.user_id == user_id, UsageLedger.workspace_id.in_(empty_workspace_ids))) if empty_workspace_ids else delete(UsageLedger).where(UsageLedger.user_id == user_id))
    db.execute(delete(PulseEvent).where(PulseEvent.user_id == user_id))
    db.execute(delete(PulseAffectedUser).where(PulseAffectedUser.user_id == user_id))
    db.execute(delete(WorkspaceMembership).where(WorkspaceMembership.user_id == user_id))
    if empty_workspace_ids:
        # Only delete workspace records after all data tied to the now-empty workspaces is removed.
        db.execute(delete(WorkspaceMembership).where(WorkspaceMembership.workspace_id.in_(empty_workspace_ids)))
        db.execute(delete(Workspace).where(Workspace.id.in_(empty_workspace_ids)))

    db.delete(user)
    db.flush()


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


@router.post("/deletion")
def delete_account(
    payload: DeleteAccountRequest,
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

    try:
        _delete_local_account_data(db, user)
        # Remove the Supabase identity before committing local deletion. If identity
        # administration fails, rollback keeps the local account intact and retryable.
        # The media cleanup above is idempotent, so it is safe to retry after failure.
        supabase_delete_user_by_email(user.email)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except SupabaseAuthError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("Account deletion failed for local user id %s", user.id)
        raise HTTPException(status_code=503, detail="Account deletion could not be completed. Your local account remains available; please retry.") from exc

    return {"deleted": True, "message": "Your XCR8 account and associated personal data have been deleted."}
