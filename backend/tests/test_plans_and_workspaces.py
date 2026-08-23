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
from app.db.models import ContentPost, PlanTier, UsageLedger, UsagePeriod, User, Workspace, WorkspaceMembership
from app.db.session import SessionLocal, engine
from app.main import app
from app.services.entitlements import consume_usage, refund_usage
from app.services.profile_scope import reset_profile_scope, set_profile_scope


# Ensure test database has current schema
models.Base.metadata.drop_all(bind=engine)
models.Base.metadata.create_all(bind=engine)


def test_create_and_list_workspace():
    db = SessionLocal()
    try:
        user = User(
            email="workspace@test.local",
            display_name="Workspace Tester",
            plan_tier=PlanTier.business,
        )
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
    assert plans["free"]["creator_profiles"] == 0
    assert plans["starter"]["creator_profiles"] == 0
    assert plans["pro"]["creator_profiles"] == 0
    assert plans["business"]["creator_profiles"] == 5
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



def test_managed_creator_profiles_require_business():
    db = SessionLocal()
    try:
        free_user = User(email="free-profiles@test.local", display_name="Free Profiles")
        starter_user = User(
            email="starter-profiles@test.local",
            display_name="Starter Profiles",
            plan_tier=PlanTier.starter,
        )
        pro_user = User(
            email="pro-profiles@test.local",
            display_name="Pro Profiles",
            plan_tier=PlanTier.pro,
        )
        business_user = User(
            email="business-profiles@test.local",
            display_name="Business Profiles",
            plan_tier=PlanTier.business,
        )
        blocked_users = [free_user, starter_user, pro_user]
        db.add_all([*blocked_users, business_user])
        db.commit()
        for user in [*blocked_users, business_user]:
            db.refresh(user)

        client = TestClient(app)
        for user in blocked_users:
            blocked = client.post(
                "/api/v1/workspaces/",
                params={"user_id": user.id},
                json={"name": f"{user.display_name} Brand"},
            )
            assert blocked.status_code == 403
            assert blocked.json()["detail"]["code"] == "feature_not_in_plan"
            assert blocked.json()["detail"]["resource"] == "creator_profiles"
            assert blocked.json()["detail"]["limit"] == 0

        for index in range(1, 6):
            created = client.post(
                "/api/v1/workspaces/",
                params={"user_id": business_user.id},
                json={
                    "name": f"Business Brand {index}",
                    "description": "Managed creator profile",
                },
            )
            assert created.status_code == 200
            assert created.json()["limit"] == 5

        over_limit = client.post(
            "/api/v1/workspaces/",
            params={"user_id": business_user.id},
            json={"name": "Business Brand 6"},
        )
        assert over_limit.status_code == 429
        assert over_limit.json()["detail"]["code"] == "plan_quota_exceeded"
        assert over_limit.json()["detail"]["limit"] == 5

        summary = client.get("/api/v1/workspaces/summary", params={"user_id": business_user.id})
        assert summary.status_code == 200
        assert summary.json()["count"] == 5
        assert summary.json()["limit"] == 5
        assert summary.json()["remaining"] == 0
    finally:
        db.close()


def test_failed_provider_usage_is_refunded_atomically():
    db = SessionLocal()
    try:
        user = User(
            email="refund@test.local",
            display_name="Refund Tester",
            plan_tier=PlanTier.business,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        ledger = consume_usage(
            db,
            user.id,
            "voiceover",
            idempotency_key="failed-provider-call",
            event_meta={"route": "test"},
        )
        refund = refund_usage(db, ledger, reason="provider_unavailable")
        assert refund is not None
        assert refund.credits_delta == -50

        period = db.query(UsagePeriod).filter(UsagePeriod.user_id == user.id).one()
        original = db.get(UsageLedger, ledger.id)
        assert period.credits_used == 0
        assert period.voiceovers == 0
        assert original.status == "refunded"

        duplicate = refund_usage(db, ledger, reason="provider_unavailable")
        assert duplicate is None
    finally:
        db.close()


def test_managed_profile_context_isolates_creator_content():
    db = SessionLocal()
    try:
        user = User(
            email="profile-scope@test.local",
            display_name="Profile Scope Tester",
            plan_tier=PlanTier.business,
        )
        workspace = Workspace(name="Scoped Brand", slug="scoped-brand-test")
        db.add_all([user, workspace])
        db.flush()
        db.add(
            WorkspaceMembership(
                workspace_id=workspace.id,
                user_id=user.id,
                role="owner",
                is_owner=True,
            )
        )
        db.commit()
        db.refresh(user)
        db.refresh(workspace)

        main_token = set_profile_scope("main")
        try:
            db.add(
                ContentPost(
                    user_id=user.id,
                    title="Main account post",
                    media_url="https://example.com/main.jpg",
                    master_caption="Main",
                    selected_platforms=["instagram"],
                )
            )
            db.commit()
        finally:
            reset_profile_scope(main_token)

        profile_token = set_profile_scope(workspace.id)
        try:
            db.add(
                ContentPost(
                    user_id=user.id,
                    title="Managed profile post",
                    media_url="https://example.com/profile.jpg",
                    master_caption="Profile",
                    selected_platforms=["instagram"],
                )
            )
            db.commit()
            scoped_titles = [
                row.title
                for row in db.query(ContentPost)
                .filter(ContentPost.user_id == user.id)
                .order_by(ContentPost.id)
                .all()
            ]
            assert scoped_titles == ["Managed profile post"]
        finally:
            reset_profile_scope(profile_token)

        main_token = set_profile_scope("main")
        try:
            main_titles = [
                row.title
                for row in db.query(ContentPost)
                .filter(ContentPost.user_id == user.id)
                .order_by(ContentPost.id)
                .all()
            ]
            assert main_titles == ["Main account post"]
        finally:
            reset_profile_scope(main_token)
    finally:
        db.close()
