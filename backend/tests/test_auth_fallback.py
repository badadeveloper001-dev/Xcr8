import importlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.services.auth import SupabaseAuthError


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_signup_request_code_falls_back_when_supabase_is_unavailable(monkeypatch, client):
    def boom(*args, **kwargs):
        raise SupabaseAuthError("temporary outage", 503)

    # Patch the actual email-sending helper used by the signup route so it simulates outage
    monkeypatch.setattr("app.api.routes.auth.send_signup_email_code", boom)

    response = client.post(
        "/api/v1/auth/signup/request-code",
        json={
            "full_name": "Fallback User",
            "username": "fallbackuser",
            "email": "fallback@example.com",
            "password": "Password123",
            "confirm_password": "Password123",
            "language": "en",
            "timezone": "UTC",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["message"]
    assert "message" in payload


def test_onboarding_and_profile_take_user_id_from_body_not_query():
    """Regression: user_id belongs to the JSON payload and auth comes from session cookie."""
    schema = app.openapi()

    for path in ("/api/v1/auth/onboarding", "/api/v1/auth/profile"):
        operation = schema["paths"][path]["post"]
        query_user_ids = [
            parameter
            for parameter in operation.get("parameters", [])
            if parameter.get("name") == "user_id" and parameter.get("in") == "query"
        ]
        assert query_user_ids == []
