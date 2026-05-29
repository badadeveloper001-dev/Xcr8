from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Platform character limits ─────────────────────────────
_LIMITS: dict[str, int] = {
    "x": 270,
    "instagram": 2200,
    "tiktok": 2200,
    "facebook": 63206,
    "linkedin": 3000,
    "youtube_shorts": 150,
    "threads": 500,
}

# ─── Local fallback adaptation ──────────────────────────────

def _language_transform(text: str, language: str) -> str:
    lang = language.lower()
    if lang == "nigerian_pidgin":
        return text.replace(" is ", " na ").replace(" are ", " dey ") + " 🇳🇬"
    if lang == "yoruba":
        return text + "\n\nOya, e je ka gbe e lo! 🌍"
    if lang == "code_switch":
        return text + "\n\nWe dey run am live — no dulling abeg ⚡"
    return text


def _platform_style(text: str, platform: str) -> tuple[str, str]:
    p = platform.lower()
    if p == "linkedin":
        styled = f"{text}\n\nKey insight:\n→ Consistency builds trust\n→ Document the process\n→ Share the lessons"
        hook = "Creators who document grow faster. Here's why."
    elif p == "x":
        styled = f"{text}\n\n(what do you think? 👇)"
        hook = "Hot take: this one shift changes everything."
    elif p == "instagram":
        styled = f"{text}\n.\n.\n.\nSave this for your next content sprint. 📌"
        hook = "Stop scrolling — this changes your creator trajectory. 📈"
    elif p == "tiktok":
        styled = f"POV: {text}"
        hook = "3 seconds in and your audience should already be hooked. Here's how."
    elif p == "youtube_shorts":
        styled = text
        hook = "Watch to the end — this one insight is worth 1000 posts."
    elif p == "threads":
        styled = f"{text}\n\nWho else is testing this? 👀"
        hook = "Threads rewards raw, honest takes. Here's mine."
    else:
        styled = text
        hook = "Lead with value. Always."
    return styled, hook


def _hashtags(platform: str, language: str) -> list[str]:
    base = ["#xcr8", "#creatoros", "#contentstrategy"]
    ptag = {
        "instagram": "#instagramcreator",
        "tiktok": "#tiktokcreator",
        "x": "#xcreator",
        "linkedin": "#linkedincreator",
        "facebook": "#fbcreator",
        "youtube_shorts": "#shortscreator",
        "threads": "#threadscreator",
    }.get(platform, "#creator")
    ltag = {
        "english": "#contentmarketing",
        "nigerian_pidgin": "#naijacreator",
        "yoruba": "#yorubacreator",
        "code_switch": "#afrodigital",
    }.get(language, "#globalcreator")
    return [ptag, ltag, *base]


def _local_adapt(text: str, platform: str, language: str, creator_memory: dict) -> dict:
    """Lightweight deterministic fallback when AI service is unavailable."""
    lang_text = _language_transform(text.strip(), language)
    styled, hook = _platform_style(lang_text, platform)

    tone = creator_memory.get("tone", "confident")
    emoji = creator_memory.get("emoji_style", "🔥")
    adapted = styled.strip()
    if tone and emoji:
        adapted = f"{adapted}"

    limit = _LIMITS.get(platform, 2200)
    return {
        "adapted_caption": adapted[:limit],
        "hashtags": _hashtags(platform, language),
        "hook": hook,
        "model": "local-fallback",
    }


def _local_detect_language(text: str) -> dict:
    lowered = f" {text.lower()} "

    yoruba_strong = [" oya", " shey", " awon"]
    yoruba_weak = [" e ", " ni ", " mo ", " wa ", " je ", " se "]
    pidgin_strong = [" abeg", " wahala", " no dey", " we dey", " una ", " sabi", " no wahala"]
    pidgin_weak = [" na "]

    yoruba_score = 0
    pidgin_score = 0
    for marker in yoruba_strong:
        if marker in lowered:
            yoruba_score += 2
    for marker in yoruba_weak:
        if marker in lowered:
            yoruba_score += 1
    for marker in pidgin_strong:
        if marker in lowered:
            pidgin_score += 2
    for marker in pidgin_weak:
        if marker in lowered:
            pidgin_score += 1

    if yoruba_score >= 2 and pidgin_score >= 2:
        language = "code_switch"
    elif yoruba_score >= 2:
        language = "yoruba"
    elif pidgin_score >= 2:
        language = "nigerian_pidgin"
    else:
        language = "english"

    segment_confidence = 0.8 if language != "english" else 0.65
    segments = [{"text": text, "language": language, "confidence": segment_confidence}]

    return {
        "language": language,
        "confidence": 0.65,
        "method": "heuristic",
        "model": "backend-rule-fallback",
        "secondary_language": None,
        "is_mixed": False,
        "segments": segments,
    }


# ─── Public interface ───────────────────────────────────────

def generate_adaptation(
    text: str,
    platform: str,
    language: str,
    creator_memory: dict,
) -> dict:
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                f"{settings.ai_service_url}/caption/adapt",
                json={
                    "text": text,
                    "platform": platform,
                    "language": language,
                    "creator_memory": creator_memory,
                },
            )
            response.raise_for_status()
            return response.json()
    except Exception as exc:
        logger.warning("AI service unavailable (%s); using local fallback.", exc)
        return _local_adapt(text, platform, language, creator_memory)


def detect_caption_language(text: str) -> dict:
    cleaned = text.strip()
    if not cleaned:
        return {
            "language": "english",
            "confidence": 0.0,
            "method": "heuristic",
            "model": "backend-rule-empty-text",
            "secondary_language": None,
            "is_mixed": False,
            "segments": [],
        }

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                f"{settings.ai_service_url}/caption/detect-language",
                json={"text": cleaned},
            )
            response.raise_for_status()
            data = response.json()
            language = str(data.get("language", "english")).lower()
            if language not in {"english", "nigerian_pidgin", "yoruba", "code_switch"}:
                return _local_detect_language(cleaned)
            return data
    except Exception as exc:
        logger.warning("AI language detection unavailable (%s); using local fallback.", exc)
        return _local_detect_language(cleaned)

