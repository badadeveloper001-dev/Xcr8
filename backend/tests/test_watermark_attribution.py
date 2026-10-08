from __future__ import annotations

from types import SimpleNamespace

from app.services.watermark_attribution import (
    ATTRIBUTION_TEXT,
    free_attribution,
    watermark_url,
)


def test_watermark_url_uses_public_code(monkeypatch):
    from app.services import watermark_attribution

    monkeypatch.setattr(
        watermark_attribution.settings,
        "frontend_url",
        "https://xcr8.tech/",
    )

    assert watermark_url("ABC123") == "https://xcr8.tech/c/ABC123"


def test_free_attribution_is_structured_as_linked_text(monkeypatch):
    from app.services import watermark_attribution

    user = SimpleNamespace(id=42)
    watermark = SimpleNamespace(public_code="ABC123")

    monkeypatch.setattr(
        watermark_attribution,
        "effective_plan_id",
        lambda _user: "free",
        raising=False,
    )
    monkeypatch.setattr(
        watermark_attribution,
        "get_or_create_watermark",
        lambda _db, _user: watermark,
    )
    monkeypatch.setattr(
        watermark_attribution.settings,
        "frontend_url",
        "https://xcr8.tech",
    )

    result = free_attribution(object(), user)

    assert result == {
        "text": ATTRIBUTION_TEXT,
        "url": "https://xcr8.tech/c/ABC123",
        "public_code": "ABC123",
    }
    assert "https://" not in result["text"]


def test_free_attribution_does_not_create_source_for_paid_plan(monkeypatch):
    from app.services import watermark_attribution

    monkeypatch.setattr(
        watermark_attribution,
        "effective_plan_id",
        lambda _user: "pro",
        raising=False,
    )

    called = False

    def fail_if_called(_db, _user):
        nonlocal called
        called = True
        raise AssertionError("paid plans must not create a watermark")

    monkeypatch.setattr(
        watermark_attribution,
        "get_or_create_watermark",
        fail_if_called,
    )

    assert free_attribution(object(), SimpleNamespace(id=42)) is None
    assert called is False
