import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.api.routes.account_deletion import DeleteAccountRequest, _cancel_paystack_subscription, _collect_media_urls
from app.core.config import settings


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_account_deletion_routes_are_registered_and_protected(client):
    schema = app.openapi()
    assert "/api/v1/account/deletion/request" in schema["paths"]
    assert "/api/v1/account/deletion" in schema["paths"]

    request_code = client.post("/api/v1/account/deletion/request")
    delete_account = client.post(
        "/api/v1/account/deletion",
        json={"code": "123456", "confirmation": "DELETE"},
    )

    assert request_code.status_code == 401
    assert delete_account.status_code == 401


def test_delete_request_requires_six_digit_code_and_exact_confirmation_shape():
    valid = DeleteAccountRequest(code="012345", confirmation="DELETE")
    assert valid.code == "012345"

    with pytest.raises(ValidationError):
        DeleteAccountRequest(code="12345", confirmation="DELETE")
    with pytest.raises(ValidationError):
        DeleteAccountRequest(code="12A456", confirmation="DELETE")
    with pytest.raises(ValidationError):
        DeleteAccountRequest(code="123456", confirmation="delete")


def test_media_collection_includes_post_media_and_metadata_urls():
    post = SimpleNamespace(
        media_url="https://cdn.example.com/video.mp4",
        thumbnail_url="https://cdn.example.com/thumb.jpg",
        content_meta={
            "media_urls": [
                "https://cdn.example.com/video.mp4",
                "https://cdn.example.com/alternate.mp4",
            ],
            "preview_url": "https://cdn.example.com/preview.jpg",
        },
    )

    urls = _collect_media_urls([post])

    assert urls == {
        "https://cdn.example.com/video.mp4",
        "https://cdn.example.com/thumb.jpg",
        "https://cdn.example.com/alternate.mp4",
        "https://cdn.example.com/preview.jpg",
    }



def test_account_deletion_does_not_require_paystack_when_no_subscription_exists(monkeypatch):
    monkeypatch.setattr(settings, "paystack_secret_key", "")
    user = SimpleNamespace(billing_meta={})

    _cancel_paystack_subscription(user)


def test_active_paystack_subscription_fails_closed_when_cancellation_is_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "paystack_secret_key", "")
    user = SimpleNamespace(
        billing_meta={
            "paystack_subscription_code": "SUB_test",
            "subscription_status": "active",
        }
    )

    with pytest.raises(HTTPException) as error:
        _cancel_paystack_subscription(user)

    assert error.value.status_code == 503



def test_account_deletion_recovery_payload_is_encrypted_and_requires_a_key(monkeypatch):
    from cryptography.fernet import Fernet
    from app.services.account_deletion_recovery import decrypt_payload, encrypt_payload

    monkeypatch.setattr(settings, "account_deletion_encryption_key", "")
    with pytest.raises(RuntimeError):
        encrypt_payload({"email": "creator@example.com"})

    key = Fernet.generate_key().decode("ascii")
    monkeypatch.setattr(settings, "account_deletion_encryption_key", key)
    payload = {"email": "creator@example.com", "connections": [{"platform": "x", "auth_meta": {"access_token": "secret"}}]}
    encrypted = encrypt_payload(payload)

    assert "creator@example.com" not in encrypted
    assert "secret" not in encrypted
    assert decrypt_payload(encrypted) == payload


def test_deletion_recovery_processor_requires_cron_authentication(client, monkeypatch):
    monkeypatch.setattr(settings, "cron_secret", "cron-test-secret")
    response = client.post("/api/v1/account/deletion/process-pending")
    assert response.status_code == 401


def test_platform_revocation_retry_tracks_duplicate_platform_connections():
    from app.api.routes.account_deletion import _pending_platform_connections

    connections = [
        ("instagram", {"access_token": "token-a"}),
        ("instagram", {"access_token": "token-b"}),
        ("youtube_shorts", {"access_token": "token-c"}),
    ]
    previous_results = [
        {"platform": "instagram", "status": "revoked", "connection_index": "0"},
    ]

    pending = _pending_platform_connections(connections, previous_results)

    # Indexed success skips only the exact connection. Legacy platform-level
    # success cannot safely skip either of two same-platform connections.
    assert pending == [
        (1, "instagram", {"access_token": "token-b"}),
    ]


def test_platform_revocation_retry_reuses_legacy_result_for_unique_platform():
    from app.api.routes.account_deletion import _pending_platform_connections

    connections = [
        ("instagram", {"access_token": "token-a"}),
        ("youtube_shorts", {"access_token": "token-b"}),
    ]
    previous_results = [
        {"platform": "instagram", "status": "revoked"},
    ]

    pending = _pending_platform_connections(connections, previous_results)

    assert pending == [(1, "youtube_shorts", {"access_token": "token-b"})]
