from __future__ import annotations

import json
import logging
from time import perf_counter

from openai import OpenAI

from app.core.config import settings


logger = logging.getLogger(__name__)
PROMPT_TEMPLATE_VERSION = "caption-v1"

PLATFORM_LIMITS = {
    "x": 270,
    "linkedin": 3000,
    "instagram": 2200,
    "facebook": 63206,
    "tiktok": 2200,
    "threads": 500,
    "youtube_shorts": 150,
}


SYSTEM_PROMPT = (
    "You are Xcr8 Caption Engine. Adapt creator captions for platform-native tone and structure while keeping "
    "intent intact. Return strict JSON with keys: adapted_caption (string), hashtags (array of strings), hook (string). "
    "Do not include markdown fences. Keep hashtags relevant and concise."
)


def _language_transform(text: str, language: str) -> str:
    lang = language.lower()
    if lang == "nigerian_pidgin":
        return (
            text.replace("you", "you")
            .replace("your", "your")
            .replace("for", "for")
            .replace("is", "na")
        )
    if lang == "yoruba":
        return f"{text} Oya, e je ka gbe e lo!"
    if lang == "code_switch":
        return f"{text} We dey run am live, no dulling."
    return text


def _platform_style(text: str, platform: str) -> tuple[str, str]:
    platform_key = platform.lower()
    if platform_key == "linkedin":
        return (
            f"{text}\n\nKey takeaway:\n- Ship consistently\n- Learn fast\n- Build in public",
            "Creators that document their process grow trust faster.",
        )
    if platform_key == "x":
        return (f"{text}\n\nWhat do you think?", "Hot take: consistency beats perfection every time.")
    if platform_key == "instagram":
        return (
            f"{text}\n.\n.\n.\nSave this for your next content sprint.",
            "Stop scrolling: this one shift changes your creator growth trajectory.",
        )
    if platform_key == "tiktok":
        return (f"POV: {text}", "This is how creators scale faster with less stress.")
    if platform_key == "youtube_shorts":
        return (f"{text}", "3 seconds in and your audience should already care.")
    if platform_key == "threads":
        return (f"{text}\n\nWho else is testing this strategy today?", "Threads rewards native, punchy opinions.")
    return (text, "Lead with value, then invite conversation.")


def _generate_hashtags(platform: str, language: str) -> list[str]:
    base = ["#xcr8", "#creatoros", "#contentstrategy"]
    platform_tag = {
        "instagram": "#instagramcreator",
        "tiktok": "#tiktokcreator",
        "x": "#xcreator",
        "linkedin": "#linkedincreator",
        "facebook": "#facebookcreator",
        "youtube_shorts": "#shortscreator",
        "threads": "#threadscreator",
    }.get(platform, "#creator")

    language_tag = {
        "english": "#contentenglish",
        "nigerian_pidgin": "#naijacreator",
        "yoruba": "#yorubacreator",
        "code_switch": "#afrodigital",
    }.get(language, "#globalcreator")

    return [platform_tag, language_tag, *base]


def adapt_caption(text: str, platform: str, language: str, creator_memory: dict) -> dict:
    if not settings.openai_api_key:
        fallback = _fallback_caption(text, platform, language, creator_memory)
        fallback["model"] = "rule-fallback-no-api-key"
        return fallback

    client = OpenAI(api_key=settings.openai_api_key)
    max_retries = 2
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        started = perf_counter()
        try:
            completion = client.chat.completions.create(
                model=settings.openai_model,
                temperature=0.7,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "source_caption": text,
                                "platform": platform,
                                "language": language,
                                "creator_memory": {
                                    "tone": creator_memory.get("tone", "confident"),
                                    "emoji_style": creator_memory.get("emoji_style", "🔥"),
                                    "slang_profile": creator_memory.get("slang_profile", "light"),
                                },
                                "constraints": {
                                    "max_caption_length": PLATFORM_LIMITS.get(platform, 2200),
                                    "hook_max_length": 180,
                                    "hashtags_min": 3,
                                    "hashtags_max": 8,
                                    "prompt_template_version": PROMPT_TEMPLATE_VERSION,
                                },
                            }
                        ),
                    },
                ],
            )

            raw = completion.choices[0].message.content or "{}"
            parsed = json.loads(raw)
            adapted_caption = str(parsed.get("adapted_caption", text)).strip()
            hook = str(parsed.get("hook", "Lead with value, then invite conversation.")).strip()

            hashtags = parsed.get("hashtags", [])
            if not isinstance(hashtags, list):
                hashtags = []
            hashtags = [str(tag).strip() for tag in hashtags if str(tag).strip().startswith("#")]
            if not hashtags:
                hashtags = _generate_hashtags(platform, language)

            return {
                "adapted_caption": adapted_caption[: PLATFORM_LIMITS.get(platform, 2200)],
                "hashtags": hashtags[:8],
                "hook": hook[:180],
                "model": completion.model,
                "prompt_template_version": PROMPT_TEMPLATE_VERSION,
                "latency_ms": int((perf_counter() - started) * 1000),
                "usage": {
                    "prompt_tokens": completion.usage.prompt_tokens if completion.usage else None,
                    "completion_tokens": completion.usage.completion_tokens if completion.usage else None,
                    "total_tokens": completion.usage.total_tokens if completion.usage else None,
                },
            }
        except Exception as exc:
            last_error = exc
            logger.warning(
                "OpenAI caption generation failed (attempt %s/%s): %s",
                attempt + 1,
                max_retries + 1,
                exc,
            )

    fallback = _fallback_caption(text, platform, language, creator_memory)
    fallback["model"] = "rule-fallback-after-openai-error"
    fallback["prompt_template_version"] = PROMPT_TEMPLATE_VERSION
    if last_error:
        fallback["error"] = str(last_error)
    return fallback


def _fallback_caption(text: str, platform: str, language: str, creator_memory: dict) -> dict:
    language_mapped = _language_transform(text.strip(), language)
    platform_caption, hook = _platform_style(language_mapped, platform)

    tone = creator_memory.get("tone", "confident")
    emoji_style = creator_memory.get("emoji_style", "🔥")
    styled_caption = f"{platform_caption}\n\nTone: {tone} {emoji_style}".strip()

    limit = PLATFORM_LIMITS.get(platform, 2200)
    adapted_caption = styled_caption[:limit]

    return {
        "adapted_caption": adapted_caption,
        "hashtags": _generate_hashtags(platform, language),
        "hook": hook,
        "prompt_template_version": PROMPT_TEMPLATE_VERSION,
        "latency_ms": 0,
        "usage": {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None},
    }

