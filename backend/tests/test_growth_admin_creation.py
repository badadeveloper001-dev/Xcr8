from app.db import models
from app.db.models import GrowthCampaign, InfluencerReferral, ReferralCode
from app.db.session import SessionLocal, engine
from app.core.config import settings

models.Base.metadata.drop_all(bind=engine)
models.Base.metadata.create_all(bind=engine)


def _db():
    return SessionLocal()


def _client(monkeypatch):
    monkeypatch.setattr(settings, "admin_access_code", "strong-test-admin-code")
    monkeypatch.setattr(settings, "frontend_url", "https://www.xcr8.tech")
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def test_admin_can_create_campaign_with_defaults(monkeypatch):
    client = _client(monkeypatch)
    response = client.post(
        "/api/v1/admin/growth/campaigns",
        headers={"x-admin-code": "strong-test-admin-code"},
        json={"name": "October Creator"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "active"
    assert body["attribution_window_days"] == 30
    assert body["url"].startswith("https://www.xcr8.tech/campaign/")
    db = _db()
    try:
        campaign = db.get(GrowthCampaign, body["id"])
        assert campaign is not None
        assert campaign.created_by_user_id is None
        assert campaign.campaign_code == body["campaign_code"]
    finally:
        db.close()


def test_admin_can_create_influencer_with_generated_code(monkeypatch):
    client = _client(monkeypatch)
    response = client.post(
        "/api/v1/admin/growth/influencers",
        headers={"x-admin-code": "strong-test-admin-code"},
        json={"influencer_name": "Amina"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["referral_code"]
    assert body["url"] == f"https://www.xcr8.tech/r/{body['referral_code']}"
    db = _db()
    try:
        influencer = db.get(InfluencerReferral, body["id"])
        referral = db.query(ReferralCode).filter_by(code=body["referral_code"]).one()
        assert influencer is not None
        assert influencer.created_by_user_id is None
        assert referral.influencer_referral_id == influencer.id
        assert referral.active is True
    finally:
        db.close()


def test_admin_rejects_duplicate_custom_codes(monkeypatch):
    client = _client(monkeypatch)
    first = client.post(
        "/api/v1/admin/growth/campaigns",
        headers={"x-admin-code": "strong-test-admin-code"},
        json={"name": "First", "campaign_code": "DUPLICATE26"},
    )
    second = client.post(
        "/api/v1/admin/growth/campaigns",
        headers={"x-admin-code": "strong-test-admin-code"},
        json={"name": "Second", "campaign_code": "DUPLICATE26"},
    )
    assert first.status_code == 201
    assert second.status_code == 409


def test_admin_creation_requires_admin_access(monkeypatch):
    client = _client(monkeypatch)
    response = client.post(
        "/api/v1/admin/growth/campaigns",
        json={"name": "Unauthorized"},
    )
    assert response.status_code == 401


def test_influencer_can_be_attached_to_campaign(monkeypatch):
    client = _client(monkeypatch)
    campaign = client.post(
        "/api/v1/admin/growth/campaigns",
        headers={"x-admin-code": "strong-test-admin-code"},
        json={"name": "Creator Campaign", "campaign_code": "CREATOR26"},
    )
    assert campaign.status_code == 201

    influencer = client.post(
        "/api/v1/admin/growth/influencers",
        headers={"x-admin-code": "strong-test-admin-code"},
        json={
            "influencer_name": "Amina",
            "campaign_id": campaign.json()["id"],
            "referral_code": "AMINA26",
        },
    )
    assert influencer.status_code == 201
    assert influencer.json()["campaign_id"] == campaign.json()["id"]
    assert influencer.json()["referral_code"] == "AMINA26"
