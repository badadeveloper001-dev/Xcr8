import pytest
from fastapi import HTTPException

from app.api.routes.scheduling import _authorize_cron
from app.services.pulse import classify_error, escalate_severity
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
