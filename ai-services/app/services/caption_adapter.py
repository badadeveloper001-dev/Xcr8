from __future__ import annotations

import json
import logging
import re
from time import perf_counter

from openai import OpenAI

from app.core.config import create_chat_completion, settings


logger = logging.getLogger(__name__)
PROMPT_TEMPLATE_VERSION = "caption-v2"
DETECT_TEMPLATE_VERSION = "detect-lang-v1"

SUPPORTED_LANGUAGES = {"english", "nigerian_pidgin", "yoruba", "code_switch"}

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
    "Do not include markdown fences. Keep hashtags relevant and concise. If creator memory facts are provided, "
    "use them as personalization hints without inventing details. For mixed-language captions, preserve language shifts "
    "sentence by sentence while keeping flow natural. Avoid generic creator clichés like 'consistency beats perfection', "
    "'stop scrolling', 'what do you think?', or empty motivation lines. Prefer concrete details, specific actions, and "
    "a distinct voice. Use at least one content clue from source_caption and one relevant creator memory fact when available."
)

DETECT_SYSTEM_PROMPT = (
    "You are Xcr8 Language Detection Engine. Detect the primary language style of a creator caption. "
    "Return strict JSON with keys: language (one of english, nigerian_pidgin, yoruba, code_switch), "
    "confidence (number from 0 to 1). Do not include markdown fences."
)


def _heuristic_detect_language(text: str) -> str:
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
        return "code_switch"
    if yoruba_score >= 2:
        return "yoruba"
    if pidgin_score >= 2:
        return "nigerian_pidgin"
    return "english"


def _split_sentences(text: str) -> list[str]:
    chunks = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]
    return chunks if chunks else [text.strip()]


def _detect_language_segments(text: str) -> list[dict]:
    segments: list[dict] = []
    for sentence in _split_sentences(text):
        if not sentence:
            continue
        language = _heuristic_detect_language(sentence)
        confidence = 0.8 if language != "english" else 0.65
        segments.append({"text": sentence, "language": language, "confidence": confidence})
    return segments


def _build_language_profile(segments: list[dict]) -> dict:
    if not segments:
        return {
            "language": "english",
            "secondary_language": None,
            "is_mixed": False,
            "segments": [],
        }

    counts: dict[str, int] = {}
    for segment in segments:
        language = str(segment.get("language", "english"))
        counts[language] = counts.get(language, 0) + 1

    ordered = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    primary = ordered[0][0]
    secondary = ordered[1][0] if len(ordered) > 1 else None
    is_mixed = len(counts) > 1
    if is_mixed and primary != "code_switch":
        primary = "code_switch"

    return {
        "language": primary,
        "secondary_language": secondary,
        "is_mixed": is_mixed,
        "segments": segments,
    }


def detect_caption_language(text: str) -> dict:
    cleaned = text.strip()
    if not cleaned:
        return {
            "language": "english",
            "confidence": 0.0,
            "method": "heuristic",
            "model": "rule-fallback-empty-text",
            "secondary_language": None,
            "is_mixed": False,
            "segments": [],
        }

    segments = _detect_language_segments(cleaned)
    profile = _build_language_profile(segments)

    if not settings.openai_api_key:
        return {
            "language": profile["language"],
            "confidence": 0.65,
            "method": "heuristic",
            "model": "rule-fallback-no-api-key",
            "secondary_language": profile["secondary_language"],
            "is_mixed": profile["is_mixed"],
            "segments": profile["segments"],
        }

    client = OpenAI(api_key=settings.openai_api_key)
    max_retries = 1

    for attempt in range(max_retries + 1):
        try:
            completion = create_chat_completion(client,
                model=settings.openai_model,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": DETECT_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "caption": cleaned,
                                "supported_languages": sorted(SUPPORTED_LANGUAGES),
                                "template_version": DETECT_TEMPLATE_VERSION,
                            }
                        ),
                    },
                ],
            )

            raw = completion.choices[0].message.content or "{}"
            parsed = json.loads(raw)
            language = str(parsed.get("language", "english")).strip().lower()
            if language not in SUPPORTED_LANGUAGES:
                language = _heuristic_detect_language(cleaned)

            confidence_value = parsed.get("confidence", 0.7)
            try:
                confidence = float(confidence_value)
            except (TypeError, ValueError):
                confidence = 0.7

            confidence = max(0.0, min(1.0, confidence))
            if profile["is_mixed"] and language != "code_switch":
                language = "code_switch"
                confidence = min(confidence, 0.78)
            return {
                "language": language,
                "confidence": confidence,
                "method": "model",
                "model": completion.model,
                "secondary_language": profile["secondary_language"],
                "is_mixed": profile["is_mixed"],
                "segments": profile["segments"],
            }
        except Exception as exc:
            logger.warning(
                "OpenAI language detection failed (attempt %s/%s): %s",
                attempt + 1,
                max_retries + 1,
                exc,
            )

    return {
        "language": profile["language"],
        "confidence": 0.6,
        "method": "heuristic",
        "model": "rule-fallback-after-openai-error",
        "secondary_language": profile["secondary_language"],
        "is_mixed": profile["is_mixed"],
        "segments": profile["segments"],
    }


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


def _extract_keywords(text: str, max_items: int = 4) -> list[str]:
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9_]{3,}", text.lower())
    stop_words = {
        "this",
        "that",
        "with",
        "from",
        "your",
        "have",
        "will",
        "they",
        "their",
        "about",
        "just",
        "into",
        "when",
        "then",
        "than",
        "what",
        "where",
        "while",
        "because",
        "really",
        "very",
        "more",
    }
    deduped: list[str] = []
    for token in tokens:
        if token in stop_words:
            continue
        if token not in deduped:
            deduped.append(token)
        if len(deduped) >= max_items:
            break
    return deduped


def _build_dynamic_hook(source_text: str, platform: str) -> str:
    keywords = _extract_keywords(source_text, max_items=2)
    if keywords:
        if platform.lower() == "linkedin":
            return f"If you're working on {keywords[0]}, this framework is worth stealing."
        if platform.lower() == "x":
            return f"Quick take on {keywords[0]}: this is where most creators miss it."
        return f"Before your next post on {keywords[0]}, try this shift first."
    return "Use this in your next post and compare the results."


def _looks_generic(text: str) -> bool:
    lowered = text.lower()
    generic_markers = [
        "consistency beats perfection",
        "stop scrolling",
        "what do you think",
        "lead with value",
        "who else is testing",
        "grow faster",
        "changes everything",
    ]
    return any(marker in lowered for marker in generic_markers)


def _memory_hint(memory_facts: list[str]) -> str:
    if not memory_facts:
        return ""
    # Use one concrete memory line to keep captions distinct without bloating output.
    return memory_facts[0].strip()


def _build_contextual_hashtags(source_text: str, platform: str, language: str) -> list[str]:
    base = _generate_hashtags(platform, language)
    keywords = _extract_keywords(source_text, max_items=3)
    dynamic = [f"#{keyword}" for keyword in keywords if keyword.isascii()]
    merged: list[str] = []
    for tag in [*dynamic, *base]:
        if tag not in merged:
            merged.append(tag)
    return merged[:8]


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
            completion = create_chat_completion(client,
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
                                    "memory_facts": creator_memory.get("memory_facts", []),
                                    "language_profile": creator_memory.get("language_profile", {}),
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
                hashtags = _build_contextual_hashtags(text, platform, language)

            if _looks_generic(adapted_caption):
                memory_hint = _memory_hint(creator_memory.get("memory_facts", []))
                keywords = _extract_keywords(text, max_items=2)
                detail_line = ""
                if memory_hint:
                    detail_line = f"\n\nCreator note: {memory_hint}"
                elif keywords:
                    detail_line = f"\n\nFocus on: {', '.join(keywords)}"
                adapted_caption = f"{text.strip()}{detail_line}".strip()

            if _looks_generic(hook):
                hook = _build_dynamic_hook(text, platform)

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

    memory_hint = _memory_hint(creator_memory.get("memory_facts", []))
    styled_caption = platform_caption.strip()
    if memory_hint:
        styled_caption = f"{styled_caption}\n\nCreator note: {memory_hint}"

    limit = PLATFORM_LIMITS.get(platform, 2200)
    adapted_caption = styled_caption[:limit]

    return {
        "adapted_caption": adapted_caption,
        "hashtags": _build_contextual_hashtags(text, platform, language),
        "hook": _build_dynamic_hook(text, platform) if _looks_generic(hook) else hook,
        "prompt_template_version": PROMPT_TEMPLATE_VERSION,
        "latency_ms": 0,
        "usage": {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None},
    }

