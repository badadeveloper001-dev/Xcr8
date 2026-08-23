from __future__ import annotations

import json
import logging
import re
from time import perf_counter

from openai import OpenAI

from app.core.config import create_chat_completion, settings


logger = logging.getLogger(__name__)
PROMPT_TEMPLATE_VERSION = "caption-v3"
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
    "You are Xcr8 Caption Engine, a careful editor—not a motivational quote generator. "
    "Rewrite only the supplied source_caption into a platform-native version while preserving its exact topic, "
    "facts, names, offer, meaning, and language style. Never introduce a different topic, fake experience, "
    "unsupported claim, generic advice, or a recycled previous caption. Keep the creator's level of formality. "
    "Do not add labels such as 'Caption:', 'Creator note:', or 'Here is your post'. Do not repeat the hook inside "
    "adapted_caption. Hashtags must be directly supported by words or named concepts in source_caption; return an "
    "empty array when none are useful. Return JSON only, with exactly this shape: "
    "{\"adapted_caption\":\"...\",\"hashtags\":[\"#example\"],\"hook\":\"...\"}. "
    "For Instagram, use readable spacing and at most 5 useful hashtags. For Facebook, favor natural paragraphs "
    "and avoid hashtag stuffing. For Threads, be conversational and stay within 500 characters. For YouTube "
    "Shorts, make the caption concise and searchable. For mixed-language text, preserve the same language shifts. "
    "Durable creator facts may guide tone, but source_caption always wins."
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

    if not settings.openai_api_key and not settings.deepseek_api_key:
        return {
            "language": profile["language"],
            "confidence": 0.65,
            "method": "heuristic",
            "model": "rule-fallback-no-ai-provider",
            "secondary_language": profile["secondary_language"],
            "is_mixed": profile["is_mixed"],
            "segments": profile["segments"],
        }

    client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
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
                "AI language detection failed (attempt %s/%s): %s",
                attempt + 1,
                max_retries + 1,
                exc,
            )

    return {
        "language": profile["language"],
        "confidence": 0.6,
        "method": "heuristic",
        "model": "rule-fallback-after-provider-error",
        "secondary_language": profile["secondary_language"],
        "is_mixed": profile["is_mixed"],
        "segments": profile["segments"],
    }


def _language_transform(text: str, language: str) -> str:
    """Never attempt rule-based translation; preserve the creator's source wording."""
    return text.strip()


def _platform_style(text: str, platform: str) -> tuple[str, str]:
    """Safe provider fallback: original caption, no invented hook or canned CTA."""
    return (text.strip(), "")


def _generate_hashtags(platform: str, language: str) -> list[str]:
    """Fallback tags must come from the source; add no Xcr8 or generic growth tags."""
    if language == "nigerian_pidgin":
        return ["#naijacreator"]
    if language == "yoruba":
        return ["#yorubacreator"]
    return []


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
        "creator note:",
        "here is your caption",
        "here's your caption",
        "adapted caption:",
        "source caption:",
        "as an ai",
    ]
    return any(marker in lowered for marker in generic_markers)


def _has_source_anchor(candidate: str, source_text: str, language: str) -> bool:
    """Reject unrelated English outputs while allowing multilingual rewrites."""
    source_keywords = _extract_keywords(source_text, max_items=8)
    if len(source_keywords) < 3 or language.lower() != "english":
        return True
    candidate_tokens = set(_extract_keywords(candidate, max_items=40))
    return any(keyword in candidate_tokens for keyword in source_keywords)


_VOLATILE_MEMORY_KEYS = {
    "last_master_caption",
    "last_caption",
    "last_prompt",
    "last_assistant_reply",
    "conversation_history",
    "session_history",
}


def _durable_memory_facts(memory_facts: object) -> list[str]:
    if not isinstance(memory_facts, list):
        return []

    durable: list[str] = []
    for raw_fact in memory_facts:
        fact = str(raw_fact).strip()
        if not fact:
            continue
        key = fact.split(":", 1)[0].strip().lower().replace(" ", "_")
        if key in _VOLATILE_MEMORY_KEYS or key.startswith(("last_", "recent_")):
            continue
        durable.append(fact[:240])
    return durable[:4]


def _memory_hint(memory_facts: list[str]) -> str:
    durable = _durable_memory_facts(memory_facts)
    return durable[0] if durable else ""


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
    if not settings.openai_api_key and not settings.deepseek_api_key:
        fallback = _fallback_caption(text, platform, language, creator_memory)
        fallback["model"] = "rule-fallback-no-ai-provider"
        return fallback

    client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
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
                                    "memory_facts": _durable_memory_facts(
                                        creator_memory.get("memory_facts", [])
                                    ),
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

            if (
                not adapted_caption
                or _looks_generic(adapted_caption)
                or not _has_source_anchor(adapted_caption, text, language)
            ):
                raise ValueError("Caption provider returned a generic or unrelated adaptation")

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
                "AI caption generation failed (attempt %s/%s): %s",
                attempt + 1,
                max_retries + 1,
                exc,
            )

    fallback = _fallback_caption(text, platform, language, creator_memory)
    fallback["model"] = "rule-fallback-after-provider-error"
    fallback["prompt_template_version"] = PROMPT_TEMPLATE_VERSION
    if last_error:
        fallback["error"] = str(last_error)
    return fallback


def _fallback_caption(text: str, platform: str, language: str, creator_memory: dict) -> dict:
    language_mapped = _language_transform(text.strip(), language)
    platform_caption, hook = _platform_style(language_mapped, platform)

    styled_caption = platform_caption.strip()

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

