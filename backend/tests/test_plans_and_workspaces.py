import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from app.main import app
from app.db.session import SessionLocal
from app.db.models import User
from app.db import models
from app.db.session import engine


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


def test_upgrade_plan():
    db = SessionLocal()
    try:
        user = User(email="plans@test.local", display_name="Plans Tester")
        db.add(user)
        db.commit()
        db.refresh(user)

        client = TestClient(app)
        upgrade_resp = client.post("/api/v1/plans/upgrade", params={"user_id": user.id}, json={"plan": "pro"})
        assert upgrade_resp.status_code == 200
        body = upgrade_resp.json()
        assert body.get("plan") == "pro"

        # verify persisted using a fresh session to avoid identity-map caching
        from app.db.session import SessionLocal as NewSession
        verify_db = NewSession()
        try:
            db_user = verify_db.get(User, user.id)
            assert db_user.plan_tier.value == "pro"
        finally:
            verify_db.close()
    finally:
        db.close()
