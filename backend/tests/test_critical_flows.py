import pytest
from fastapi import HTTPException

from app.api.routes.scheduling import _authorize_cron
from app.services.pulse import _redact_sensitive_detail, classify_error, detect_feature, escalate_severity
from app.services.social_publisher import build_oauth_state, verify_oauth_state


def test_oauth_state_round_trip_and_tamper_rejection(monkeypatch):
    from app.services import social_publisher

    monkeypatch.setattr(social_publisher.settings, "oauth_state_secret", "test-secret-with-enough-entropy")
    monkeypatch.setattr(social_publisher.settings, "supabase_jwt_secret", "")

    state = build_oauth_state(42, "threads")
    payload = verify_oauth_state(state)
    assert payload is not None
    assert payload["u"] == 42
    assert payload["p"] == "threads"
    assert verify_oauth_state(state + "tampered") is None


def test_cron_requires_matching_bearer_secret(monkeypatch):
    from app.api.routes import scheduling

    monkeypatch.setattr(scheduling.settings, "cron_secret", "cron-test-secret")
    _authorize_cron("Bearer cron-test-secret")
    with pytest.raises(HTTPException) as rejected:
        _authorize_cron("Bearer wrong-secret")
    assert rejected.value.status_code == 401


def test_pulse_escalates_repeated_or_widespread_incidents():
    assert escalate_severity("medium", events=5, affected_users=1) == "high"
    assert escalate_severity("high", events=20, affected_users=1) == "critical"
    assert escalate_severity("critical", events=1, affected_users=0) == "critical"


def test_pulse_classifies_critical_auth_database_failure():
    error_type, severity = classify_error(
        500,
        "database connection unavailable",
        "/api/v1/auth/login",
    )
    assert error_type == "system_error"
    assert severity == "critical"


def test_pulse_redacts_credentials_and_personal_email():
    detail = _redact_sensitive_detail(
        "Authorization: Bearer private-token password=hunter2 user@example.com"
    )
    assert "private-token" not in detail
    assert "hunter2" not in detail
    assert "user@example.com" not in detail
    assert "[redacted]" in detail


def test_pulse_detects_costly_and_background_features():
    assert detect_feature("/api/v1/ai/image/generate") == "image_generation"
    assert detect_feature("/api/v1/ai/video/export") == "video_generation"
    assert detect_feature("/api/v1/scheduling/dispatch-due") == "scheduling_dispatch"
    assert detect_feature("/api/v1/plans/webhook/paystack") == "payment"
