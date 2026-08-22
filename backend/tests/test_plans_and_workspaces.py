import hashlib
import hmac
import json
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.db import models
from app.db.models import UsageLedger, UsagePeriod, User
from app.db.session import SessionLocal, engine
from app.main import app
from app.services.entitlements import consume_usage


# Ensure test database has current schema
models.Base.metadata.drop_all(bind=engine)
models.Base.metadata.create_all(bind=engine)


def test_create_and_list_workspace():
    db = SessionLocal()
    try:
        user = User(email="workspace@test.local", display_name="Workspace Tester")
        db.add(user)
        db.commit()
        db.refresh(user)

        client = TestClient(app)
        create_resp = client.post("/api/v1/workspaces", params={"user_id": user.id}, json={"name": "Acme Agency"})
        assert create_resp.status_code == 200
        payload = create_resp.json()
        assert payload.get("name") == "Acme Agency"
        assert payload.get("slug")

        list_resp = client.get("/api/v1/workspaces", params={"user_id": user.id})
        assert list_resp.status_code == 200
        items = list_resp.json()
        assert any(i.get("id") == payload.get("id") for i in items)
    finally:
        db.close()


def test_direct_upgrade_is_blocked_and_verified_webhook_upgrades(monkeypatch):
    db = SessionLocal()
    try:
        user = User(email="plans@test.local", display_name="Plans Tester")
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id

        client = TestClient(app)
        upgrade_resp = client.post(
            "/api/v1/plans/upgrade",
            params={"user_id": user_id},
            json={"plan": "pro"},
        )
        assert upgrade_resp.status_code == 403
        assert upgrade_resp.json()["detail"]["code"] == "verified_payment_required"

        monkeypatch.setattr(settings, "billing_webhook_secret", "test-billing-secret")
        payload = {
            "event_id": "evt_test_plan_1",
            "user_id": user_id,
            "plan": "starter",
            "status": "paid",
            "customer_id": "cus_test",
        }
        raw = json.dumps(payload, separators=(",", ":")).encode()
        signature = hmac.new(b"test-billing-secret", raw, hashlib.sha256).hexdigest()

        webhook_resp = client.post(
            "/api/v1/plans/webhook/test-provider",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "X-Xcr8-Signature": f"sha256={signature}",
            },
        )
        assert webhook_resp.status_code == 200
        assert webhook_resp.json()["plan"] == "starter"

        duplicate_resp = client.post(
            "/api/v1/plans/webhook/test-provider",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "X-Xcr8-Signature": signature,
            },
        )
        assert duplicate_resp.status_code == 200
        assert duplicate_resp.json()["duplicate"] is True

        verify_db = SessionLocal()
        try:
            db_user = verify_db.get(User, user_id)
            assert db_user.plan_tier.value == "starter"
        finally:
            verify_db.close()
    finally:
        db.close()


def test_usage_deduction_is_idempotent_and_free_images_are_blocked():
    db = SessionLocal()
    try:
        user = User(email="usage@test.local", display_name="Usage Tester")
        db.add(user)
        db.commit()
        db.refresh(user)

        first = consume_usage(
            db,
            user.id,
            "text_generation",
            idempotency_key="same-request",
            event_meta={"route": "test"},
        )
        second = consume_usage(
            db,
            user.id,
            "text_generation",
            idempotency_key="same-request",
            event_meta={"route": "test"},
        )
        assert first.id == second.id

        period = db.query(UsagePeriod).filter(UsagePeriod.user_id == user.id).one()
        ledger_rows = db.query(UsageLedger).filter(UsageLedger.user_id == user.id).all()
        assert period.credits_granted == 500
        assert period.credits_used == 5
        assert period.text_generations == 1
        assert len(ledger_rows) == 1

        with pytest.raises(HTTPException) as exc_info:
            consume_usage(db, user.id, "image_generation")
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["code"] == "feature_not_in_plan"
    finally:
        db.close()


def test_plan_catalog_matches_entitlements():
    client = TestClient(app)
    response = client.get("/api/v1/plans/")
    assert response.status_code == 200
    plans = {row["id"]: row for row in response.json()}

    assert plans["free"]["monthly_credits"] == 500
    assert plans["free"]["image_generations"] == 0
    assert plans["free"]["voiceovers"] == 0
    assert plans["starter"]["social_accounts"] == 3
    assert plans["pro"]["high_quality_images"] == 10
    assert plans["business"]["storage_megabytes"] == 50 * 1024


def test_admin_can_grant_business_plan_with_audit_ledger(monkeypatch):
    db = SessionLocal()
    try:
        user = User(email="owner-grant@test.local", display_name="Owner Grant Tester")
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id

        monkeypatch.setattr(settings, "admin_access_code", "strong-test-admin-code")
        client = TestClient(app)
        response = client.patch(
            f"/api/v1/admin/creators/{user_id}/plan",
            json={"plan": "agency", "actor": "Test Admin", "note": "Founder grant"},
            headers={"x-admin-code": "strong-test-admin-code"},
        )
        assert response.status_code == 200
        assert response.json()["plan"] == "business"

        verify_db = SessionLocal()
        try:
            saved_user = verify_db.get(User, user_id)
            assert saved_user.plan_tier.value == "business"
            ledger = (
                verify_db.query(UsageLedger)
                .filter(
                    UsageLedger.user_id == user_id,
                    UsageLedger.event_type == "admin_plan_override",
                )
                .one()
            )
            assert ledger.status == "granted"
            assert ledger.event_meta["previous_plan"] == "free"
            assert ledger.event_meta["plan"] == "business"
        finally:
            verify_db.close()
    finally:
        db.close()
