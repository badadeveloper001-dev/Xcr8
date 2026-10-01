from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import secrets
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    AcquisitionAttribution,
    AttributionVisit,
    GrowthCampaign,
    GrowthEvent,
    InfluencerReferral,
    ReferralCode,
    WatermarkLink,
)


AttributionType = Literal["campaign", "influencer", "user_referral", "watermark"]


@dataclass(frozen=True)
class AttributionSource:
    source_type: AttributionType
    referral_code: str | None = None
    campaign_id: int | None = None
    influencer_referral_id: int | None = None
    watermark_id: int | None = None
    referrer_user_id: int | None = None
    attribution_window_days: int = 30


@dataclass(frozen=True)
class VisitCapture:
    tracking_id: str
    visitor_token: str
    source: AttributionSource


def _normalize_code(value: str) -> str:
    return str(value or "").strip()


def _bounded_window(days: int | None) -> int:
    try:
        value = int(days or 30)
    except (TypeError, ValueError):
        value = 30
    return max(1, min(value, 3650))


def _new_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def resolve_campaign(db: Session, campaign_code: str) -> AttributionSource:
    code = _normalize_code(campaign_code)
    campaign = db.scalar(
        select(GrowthCampaign).where(
            GrowthCampaign.campaign_code == code,
            GrowthCampaign.status == "active",
        )
    )
    if not campaign:
        raise ValueError("Campaign not found or inactive.")

    return AttributionSource(
        source_type="campaign",
        referral_code=campaign.campaign_code,
        campaign_id=campaign.id,
        attribution_window_days=_bounded_window(campaign.attribution_window_days),
    )


def resolve_referral_code(db: Session, referral_code: str) -> AttributionSource:
    code = _normalize_code(referral_code)
    referral = db.scalar(
        select(ReferralCode).where(
            ReferralCode.code == code,
            ReferralCode.active.is_(True),
        )
    )
    if not referral:
        raise ValueError("Referral code not found or inactive.")

    owners = [
        referral.campaign_id is not None,
        referral.influencer_referral_id is not None,
        referral.owner_user_id is not None,
    ]
    if sum(owners) != 1:
        raise ValueError("Referral code has an invalid ownership configuration.")

    if referral.code_type == "influencer" and referral.influencer_referral_id is not None:
        influencer = db.get(InfluencerReferral, referral.influencer_referral_id)
        if not influencer or influencer.status != "active":
            raise ValueError("Influencer referral is not active.")
        return AttributionSource(
            source_type="influencer",
            referral_code=referral.code,
            influencer_referral_id=influencer.id,
            campaign_id=influencer.campaign_id,
            attribution_window_days=_bounded_window(influencer.attribution_window_days),
        )

    if referral.code_type == "user" and referral.owner_user_id is not None:
        return AttributionSource(
            source_type="user_referral",
            referral_code=referral.code,
            referrer_user_id=referral.owner_user_id,
        )

    if referral.code_type == "campaign" and referral.campaign_id is not None:
        campaign = db.get(GrowthCampaign, referral.campaign_id)
        if not campaign or campaign.status != "active":
            raise ValueError("Campaign is not active.")
        return AttributionSource(
            source_type="campaign",
            referral_code=referral.code,
            campaign_id=campaign.id,
            attribution_window_days=_bounded_window(campaign.attribution_window_days),
        )

    raise ValueError("Referral code type does not match its owner.")


def resolve_watermark(db: Session, public_code: str) -> AttributionSource:
    code = _normalize_code(public_code)
    watermark = db.scalar(
        select(WatermarkLink).where(
            WatermarkLink.public_code == code,
            WatermarkLink.active.is_(True),
        )
    )
    if not watermark:
        raise ValueError("Watermark link not found or inactive.")

    return AttributionSource(
        source_type="watermark",
        watermark_id=watermark.id,
    )


def capture_visit(
    db: Session,
    source: AttributionSource,
    *,
    visitor_token: str | None = None,
    landing_url: str | None = None,
    referrer_url: str | None = None,
    utm_source: str | None = None,
    utm_medium: str | None = None,
    utm_campaign: str | None = None,
    utm_content: str | None = None,
) -> VisitCapture:
    token = _normalize_code(visitor_token) or _new_token()
    tracking_id = _new_token(24)

    visit = AttributionVisit(
        tracking_id=tracking_id,
        referral_code=source.referral_code,
        campaign_id=source.campaign_id,
        influencer_referral_id=source.influencer_referral_id,
        watermark_id=source.watermark_id,
        visitor_token=token,
        landing_url=landing_url,
        referrer_url=referrer_url,
        utm_source=utm_source,
        utm_medium=utm_medium,
        utm_campaign=utm_campaign,
        utm_content=utm_content,
    )
    db.add(visit)

    db.add(
        GrowthEvent(
            event_type=("watermark_link_clicked" if source.source_type == "watermark" else "referral_link_clicked"),
            campaign_id=source.campaign_id,
            influencer_referral_id=source.influencer_referral_id,
            referral_code=source.referral_code,
            watermark_id=source.watermark_id,
            referrer_user_id=source.referrer_user_id,
            event_time=datetime.now(tz=UTC),
            metadata={"source_type": source.source_type, "tracking_id": tracking_id},
        )
    )
    db.commit()

    return VisitCapture(
        tracking_id=tracking_id,
        visitor_token=token,
        source=source,
    )


def _source_from_visit(db: Session, visit: AttributionVisit) -> AttributionSource:
    if visit.watermark_id is not None:
        watermark = db.get(WatermarkLink, visit.watermark_id)
        if not watermark or not watermark.active:
            raise ValueError("Watermark source is no longer active.")
        return AttributionSource(source_type="watermark", watermark_id=watermark.id)

    if visit.referral_code:
        try:
            return resolve_referral_code(db, visit.referral_code)
        except ValueError:
            return resolve_campaign(db, visit.referral_code)

    if visit.campaign_id is not None:
        campaign = db.get(GrowthCampaign, visit.campaign_id)
        if not campaign or campaign.status != "active":
            raise ValueError("Campaign source is no longer active.")
        return AttributionSource(
            source_type="campaign",
            referral_code=campaign.campaign_code,
            campaign_id=campaign.id,
            attribution_window_days=_bounded_window(campaign.attribution_window_days),
        )

    raise ValueError("Attribution visit has no resolvable source.")


def _visit_is_eligible(
    visit: AttributionVisit,
    source: AttributionSource,
    now: datetime,
) -> bool:
    window = timedelta(days=_bounded_window(source.attribution_window_days))
    return visit.first_seen_at >= now - window


def attach_user_attribution(
    db: Session,
    user_id: int,
    *,
    visitor_token: str | None = None,
    tracking_id: str | None = None,
    event_type: str = "signup_completed",
) -> AcquisitionAttribution | None:
    token = _normalize_code(visitor_token)
    tracking = _normalize_code(tracking_id)

    visit = None
    if tracking:
        visit = db.scalar(select(AttributionVisit).where(AttributionVisit.tracking_id == tracking))
    elif token:
        visit = db.scalar(
            select(AttributionVisit)
            .where(AttributionVisit.visitor_token == token)
            .order_by(AttributionVisit.last_seen_at.desc())
        )

    if not visit:
        return None

    try:
        source = _source_from_visit(db, visit)
    except ValueError:
        return None

    now = datetime.now(tz=UTC)
    if not _visit_is_eligible(visit, source, now):
        return None

    attribution = db.scalar(
        select(AcquisitionAttribution).where(AcquisitionAttribution.user_id == user_id)
    )
    if not attribution:
        attribution = AcquisitionAttribution(user_id=user_id)
        db.add(attribution)

    if attribution.first_touch_at is None:
        attribution.first_touch_type = source.source_type
        attribution.first_touch_referral_code = source.referral_code
        attribution.first_touch_campaign_id = source.campaign_id
        attribution.first_touch_influencer_id = source.influencer_referral_id
        attribution.first_touch_watermark_id = source.watermark_id
        attribution.first_touch_at = visit.first_seen_at
        attribution.attribution_window_days = _bounded_window(source.attribution_window_days)

    attribution.last_touch_type = source.source_type
    attribution.last_touch_referral_code = source.referral_code
    attribution.last_touch_campaign_id = source.campaign_id
    attribution.last_touch_influencer_id = source.influencer_referral_id
    attribution.last_touch_watermark_id = source.watermark_id
    attribution.last_touch_at = visit.last_seen_at

    if event_type == "signup_completed" and attribution.signup_at is None:
        attribution.signup_at = now

    db.add(
        GrowthEvent(
            user_id=user_id,
            campaign_id=source.campaign_id,
            influencer_referral_id=source.influencer_referral_id,
            referral_code=source.referral_code,
            watermark_id=source.watermark_id,
            event_type=event_type,
            event_time=now,
            metadata={"tracking_id": visit.tracking_id, "source_type": source.source_type},
        )
    )
    db.commit()
    db.refresh(attribution)
    return attribution
