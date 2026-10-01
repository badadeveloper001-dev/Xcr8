from __future__ import annotations

import pytest

from app.services.watermark_platform_attribution import (
    AttributionPayload,
    build_attribution_payload,
    can_publish_linked_attribution,
    linked_text_mode,
)


def test_build_attribution_payload_keeps_visible_text_separate_from_url():
    payload = build_attribution_payload(
        {
            "text": "Published with XCR8",
            "url": "https://xcr8.tech/c/ABC123",
            "public_code": "ABC123",
        }
    )

    assert payload == AttributionPayload(
        text="Published with XCR8",
        url="https://xcr8.tech/c/ABC123",
        public_code="ABC123",
    )
    assert "https://" not in payload.text


@pytest.mark.parametrize("platform", ["facebook", "instagram", "threads", "youtube_shorts"])
def test_current_platforms_do_not_claim_unverified_linked_text(platform):
    assert linked_text_mode(platform) == "unsupported"
    assert can_publish_linked_attribution(platform) is False


def test_unknown_platform_does_not_get_a_guessed_capability():
    assert linked_text_mode("unknown-platform") == "unsupported"
    assert can_publish_linked_attribution("unknown-platform") is False


def test_invalid_payload_is_rejected():
    with pytest.raises(ValueError, match="requires text, url, and public_code"):
        build_attribution_payload({"text": "Published with XCR8", "url": "", "public_code": "ABC123"})


def test_raw_url_is_not_allowed_inside_visible_attribution_text():
    with pytest.raises(ValueError, match="must not contain the destination URL"):
        build_attribution_payload(
            {
                "text": "Published with XCR8 https://xcr8.tech/c/ABC123",
                "url": "https://xcr8.tech/c/ABC123",
                "public_code": "ABC123",
            }
        )
