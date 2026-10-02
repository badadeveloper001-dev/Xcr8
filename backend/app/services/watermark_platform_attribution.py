from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


ATTRIBUTION_LINK_MODE = Literal["linked_text", "unsupported"]


@dataclass(frozen=True)
class AttributionPayload:
    """Canonical XCR8 Free-plan attribution before platform formatting."""

    text: str
    url: str
    public_code: str


# Keep this explicit rather than guessing from a platform's generic URL support.
# A platform is only marked linked_text when its publishing API is verified to
# support making the exact visible attribution text the hyperlink.
_LINKED_TEXT_CAPABILITIES: dict[str, bool] = {
    "facebook": False,
    "instagram": False,
    "threads": False,
    "youtube_shorts": False,
}


def build_attribution_payload(
    attribution: dict[str, str] | None,
) -> AttributionPayload | None:
    if not attribution:
        return None

    text = str(attribution.get("text") or "").strip()
    url = str(attribution.get("url") or "").strip()
    public_code = str(attribution.get("public_code") or "").strip()

    if not text or not url or not public_code:
        raise ValueError("Attribution payload requires text, url, and public_code.")

    # The canonical visible text must remain independent of the destination URL.
    if url in text:
        raise ValueError("Attribution text must not contain the destination URL.")

    return AttributionPayload(
        text=text,
        url=url,
        public_code=public_code,
    )


def linked_text_mode(platform: str) -> ATTRIBUTION_LINK_MODE:
    """Return the verified publishing mode for exact linked attribution text."""
    return "linked_text" if _LINKED_TEXT_CAPABILITIES.get(platform.lower(), False) else "unsupported"


def can_publish_linked_attribution(platform: str) -> bool:
    return linked_text_mode(platform) == "linked_text"


def format_platform_attribution(
    caption: str,
    platform: str,
    attribution: AttributionPayload | None,
) -> str:
    """Apply attribution only when the platform can preserve the required linked-text UX.

    Unsupported platforms intentionally keep the original caption. This prevents
    XCR8 from silently replacing the required hidden link with a raw URL.
    """
    if not attribution or not can_publish_linked_attribution(platform):
        return caption

    # No currently verified platform reaches this branch. Keep the formatter
    # explicit so a verified adapter can be added without changing publish_post().
    return caption
