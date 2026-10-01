from datetime import UTC, datetime, timedelta

from app.db.models import (
    AttributionVisit,
    GrowthCampaign,
    GrowthEvent,
    InfluencerReferral,
    ReferralCode,
    User,
    WatermarkLink,
)
from app.services.growth_attribution import (
    attach_user_attribution,
    capture_visit,
    resolve_campaign,
    resolve_referral_code,
    resolve_watermark,
)


def test_campaign_resolution_is_server_side(db):
    admin = User(email="admin-growth@example.com", display_name="Admin")
    db.add(admin)
    db.flush()
    campaign = GrowthCampaign(
        campaign_code="OCTCREATOR26",
        name="October Creator",
        created_by_user_id=admin.id,
    )
    db.add(campaign)
    db.commit()

    source = resolve_campaign(db, "OCTCREATOR26")
    assert source.source_type == "campaign"
    assert source.campaign_id == campaign.id
    assert source.referral_code == "OCTCREATOR26"


def test_influencer_resolution_requires_active_owner(db):
    admin = User(email="admin-influencer@example.com", display_name="Admin")
    db.add(admin)
    db.flush()
    influencer = InfluencerReferral(
        influencer_name="Amina",
        campaign_id=None,
        created_by_user_id=admin.id,
    )
    db.add(influencer)
    db.flush()
    code = ReferralCode(
        code="AMINA26",
        code_type="influencer",
        influencer_referral_id=influencer.id,
    )
    db.add(code)
    db.commit()

    source = resolve_referral_code(db, "AMINA26")
    assert source.source_type == "influencer"
    assert source.influencer_referral_id == influencer.id


def test_watermark_resolution_is_server_side(db):
    creator = User(email="creator-watermark@example.com", display_name="Creator")
    db.add(creator)
    db.flush()
    watermark = WatermarkLink(
        creator_user_id=creator.id,
        public_code="WM123",
    )
    db.add(watermark)
    db.commit()

    source = resolve_watermark(db, "WM123")
    assert source.source_type == "watermark"
    assert source.watermark_id == watermark.id


def test_first_touch_is_preserved_when_second_source_arrives(db):
    creator = User(email="creator-attribution@example.com", display_name="Creator")
    db.add(creator)
    db.flush()
    first = GrowthCampaign(
        campaign_code="FIRST26",
        name="First",
        created_by_user_id=creator.id,
    )
    second = GrowthCampaign(
        campaign_code="SECOND26",
        name="Second",
        created_by_user_id=creator.id,
    )
    db.add_all([first, second])
    db.commit()

    user = User(email="new-user@example.com", display_name="New User")
    db.add(user)
    db.commit()

    first_capture = capture_visit(db, resolve_campaign(db, "FIRST26"))
    attach_user_attribution(db, user.id, tracking_id=first_capture.tracking_id)

    second_capture = capture_visit(db, resolve_campaign(db, "SECOND26"))
    attribution = attach_user_attribution(db, user.id, tracking_id=second_capture.tracking_id)

    assert attribution.first_touch_campaign_id == first.id
    assert attribution.last_touch_campaign_id == second.id


def test_expired_visit_does_not_attribute(db):
    creator = User(email="creator-expired@example.com", display_name="Creator")
    db.add(creator)
    db.flush()
    campaign = GrowthCampaign(
        campaign_code="OLD26",
        name="Old",
        attribution_window_days=30,
        created_by_user_id=creator.id,
    )
    db.add(campaign)
    db.commit()

    user = User(email="expired-user@example.com", display_name="Expired")
    db.add(user)
    db.commit()

    capture = capture_visit(db, resolve_campaign(db, "OLD26"))
    visit = db.get(AttributionVisit, capture.tracking_id)
    visit.first_seen_at = datetime.now(tz=UTC) - timedelta(days=31)
    visit.last_seen_at = visit.first_seen_at
    db.commit()

    assert attach_user_attribution(db, user.id, tracking_id=capture.tracking_id) is None


def test_invalid_referral_owner_configuration_is_rejected(db):
    campaign_owner = User(email="owner@example.com", display_name="Owner")
    db.add(campaign_owner)
    db.flush()
    campaign = GrowthCampaign(
        campaign_code="CAMP26",
        name="Campaign",
        created_by_user_id=campaign_owner.id,
    )
    db.add(campaign)
    db.flush()
    code = ReferralCode(
        code="BROKEN26",
        code_type="influencer",
        campaign_id=campaign.id,
    )
    db.add(code)
    db.commit()

    try:
        resolve_referral_code(db, "BROKEN26")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "type" in str(exc).lower() or "ownership" in str(exc).lower()
