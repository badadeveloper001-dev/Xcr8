import pytest

from app.db import models
from app.db.models import GrowthCampaign, InfluencerReferral, ReferralCode, User, WatermarkLink
from app.db.session import SessionLocal, engine
from app.core.config import settings

# Never allow this regression module to touch a PostgreSQL database.
# CI/local regression runs use the isolated SQLite development database.
if settings.database_url.startswith("postgresql"):
    pytest.skip(
        "Growth attribution route regression tests require the isolated SQLite test database.",
        allow_module_level=True,
    )

models.Base.metadata.create_all(bind=engine)


def _db():
    return SessionLocal()


def test_campaign_entry_resolves_and_redirects(monkeypatch):
    db = _db()
    try:
        admin = User(email="entry-admin@example.com", display_name="Admin")
        db.add(admin)
        db.flush()
        db.add(GrowthCampaign(
            campaign_code="ENTRY26",
            name="Entry",
            created_by_user_id=admin.id,
        ))
        db.commit()
        monkeypatch.setattr(settings, "frontend_url", "https://www.xcr8.tech")

        from fastapi.testclient import TestClient
        from app.main import app

        response = TestClient(app).get("/campaign/ENTRY26", follow_redirects=False)
        assert response.status_code == 307
        assert "attribution_token=" in response.headers["location"]
        assert "xcr8_attribution=" in response.headers.get("set-cookie", "")
    finally:
        db.close()


def test_influencer_entry_does_not_trust_client_owner(monkeypatch):
    db = _db()
    try:
        admin = User(email="entry-influencer-admin@example.com", display_name="Admin")
        db.add(admin)
        db.flush()
        influencer = InfluencerReferral(
            influencer_name="Amina",
            created_by_user_id=admin.id,
        )
        db.add(influencer)
        db.flush()
        db.add(ReferralCode(
            code="ENTRYAMINA26",
            code_type="influencer",
            influencer_referral_id=influencer.id,
        ))
        db.commit()
        monkeypatch.setattr(settings, "frontend_url", "https://www.xcr8.tech")

        from fastapi.testclient import TestClient
        from app.main import app

        response = TestClient(app).get(
            "/r/ENTRYAMINA26?owner_user_id=999999",
            follow_redirects=False,
        )
        assert response.status_code == 307
        assert "attribution_token=" in response.headers["location"]
    finally:
        db.close()


def test_watermark_entry_uses_watermark_event(monkeypatch):
    db = _db()
    try:
        creator = User(email="entry-watermark@example.com", display_name="Creator")
        db.add(creator)
        db.flush()
        db.add(WatermarkLink(
            creator_user_id=creator.id,
            public_code="ENTRYWM26",
        ))
        db.commit()
        monkeypatch.setattr(settings, "frontend_url", "https://www.xcr8.tech")

        from fastapi.testclient import TestClient
        from app.main import app

        response = TestClient(app).get("/c/ENTRYWM26", follow_redirects=False)
        assert response.status_code == 307
        event = db.query(models.GrowthEvent).filter_by(event_type="watermark_link_clicked").one()
        assert event.watermark_id is not None
    finally:
        db.close()
