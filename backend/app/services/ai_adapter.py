from __future__ import annotations

import logging
import os
import re

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


def _ai_service_candidates() -> list[str]:
    urls: list[str] = []
    configured = settings.ai_service_url.strip()
    if configured:
        urls.append(configured.rstrip("/"))

    vercel_host = os.getenv("VERCEL_PROJECT_PRODUCTION_URL") or os.getenv("VERCEL_URL")
    if vercel_host:
        host = vercel_host.strip()
        if host:
            if not host.startswith("http://") and not host.startswith("https://"):
                host = f"https://{host}"
            fallback = f"{host.rstrip('/')}/_/ai-services"
            if fallback not in urls:
                urls.append(fallback)

    localhost = "http://localhost:8100"
    if localhost not in urls:
        urls.append(localhost)

    return urls


def ai_service_headers() -> dict[str, str]:
    token = str(settings.ai_internal_token or settings.oauth_state_secret or settings.cron_secret or "").strip()
    return {"X-Xcr8-Internal-Token": token} if token else {}


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
        styled = f"{text}\n\nTry this structure:\n1) Show your process\n2) Share one proof point\n3) End with one next step"
        hook = "If you're building in public, this workflow is worth trying this week."
    elif p == "x":
        styled = f"{text}\n\nReply with your current workflow and I'll share a tighter version."
        hook = "Quick take: small systems beat random motivation."
    elif p == "instagram":
        styled = f"{text}\n\nSave this and test it on your next content day."
        hook = "Before your next post, apply this 1-step tweak first."
    elif p == "tiktok":
        styled = f"POV: {text}"
        hook = "Use this opening line and watch retention in the first 3 seconds."
    elif p == "youtube_shorts":
        styled = text
        hook = "Keep this short and concrete so viewers stay till the last second."
    elif p == "threads":
        styled = f"{text}\n\nTesting this all week. I'll report the results here."
        hook = "Trying this in real-time. Join the experiment."
    else:
        styled = text
        hook = "Use a concrete example and invite one specific reply."
    return styled, hook


def _extract_keywords(text: str, max_items: int = 3) -> list[str]:
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
    }
    result: list[str] = []
    for token in tokens:
        if token in stop_words:
            continue
        if token not in result:
            result.append(token)
        if len(result) >= max_items:
            break
    return result


def _memory_hint(creator_memory: dict) -> str:
    facts = creator_memory.get("memory_facts", [])
    if isinstance(facts, list) and facts:
        first = str(facts[0]).strip()
        if first:
            return first
    return ""


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


def _contextual_hashtags(text: str, platform: str, language: str) -> list[str]:
    dynamic = [f"#{token}" for token in _extract_keywords(text, max_items=3)]
    merged: list[str] = []
    for tag in [*dynamic, *_hashtags(platform, language)]:
        if tag not in merged:
            merged.append(tag)
    return merged[:8]


def _local_adapt(text: str, platform: str, language: str, creator_memory: dict) -> dict:
    """Lightweight deterministic fallback when AI service is unavailable."""
    lang_text = _language_transform(text.strip(), language)
    styled, hook = _platform_style(lang_text, platform)

    adapted = styled.strip()

    memory_hint = _memory_hint(creator_memory)
    if memory_hint:
        adapted = f"{adapted}\n\nCreator note: {memory_hint}"

    limit = _LIMITS.get(platform, 2200)
    return {
        "adapted_caption": adapted[:limit],
        "hashtags": _contextual_hashtags(text, platform, language),
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


def _local_brainstorm(payload: dict) -> dict:
    topic = str(payload.get("topic", "content ideas")).strip()
    platform = str(payload.get("platform", "instagram")).strip().lower()
    language = str(payload.get("language", "english")).strip().lower()
    goal = str(payload.get("goal", "grow audience")).strip()
    tone = str(payload.get("tone", "conversational")).strip()
    creator_memory = payload.get("creator_memory", {}) if isinstance(payload.get("creator_memory", {}), dict) else {}

    keywords = _extract_keywords(topic, max_items=3)
    primary = keywords[0] if keywords else topic.split()[0]
    secondary = keywords[1] if len(keywords) > 1 else primary
    hashtags = _contextual_hashtags(topic, platform, language)
    memory_hint = _memory_hint(creator_memory)

    ideas = [
        {
            "title": f"{primary.title()} breakdown",
            "angle": f"Explain the {primary} workflow step by step in a {tone} way for people trying to {goal}.",
            "hook": f"I tried a simpler {primary} system and the results were better than expected.",
            "caption_seed": f"Break down your exact {primary} process using one clear example and one practical takeaway.",
            "cta": "Ask people to share the part they want you to unpack next.",
            "hashtags": hashtags,
        },
        {
            "title": f"Mistakes around {secondary}",
            "angle": f"Show the 3 most common mistakes creators make when approaching {secondary}.",
            "hook": f"Most people get {secondary} wrong because they skip this one step.",
            "caption_seed": f"Open with the biggest mistake, then show the fix and end with a short checklist.",
            "cta": "Invite the audience to comment the mistake they’re correcting first.",
            "hashtags": hashtags,
        },
        {
            "title": f"Behind-the-scenes {primary}",
            "angle": f"Reveal a behind-the-scenes workflow that helps you stay consistent while building toward {goal}.",
            "hook": f"Here’s the workflow I use when I need to stay consistent with {primary}.",
            "caption_seed": f"Describe the routine in a way that feels real and usable today, not aspirational fluff.",
            "cta": "Tell them to save the post and test the routine this week.",
            "hashtags": hashtags,
        },
    ]

    if memory_hint:
        for item in ideas:
            item["caption_seed"] = f"{item['caption_seed']} Creator note: {memory_hint}"

    return {
        "topic": topic,
        "platform": platform,
        "language": language,
        "goal": goal,
        "model": "backend-local-brainstorm",
        "prompt_template_version": "idea-v1",
        "latency_ms": 0,
        "ideas": ideas,
        "usage": {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None},
    }


# ─── Public interface ───────────────────────────────────────

def generate_adaptation(
    text: str,
    platform: str,
    language: str,
    creator_memory: dict,
) -> dict:
    last_error: Exception | None = None
    for base_url in _ai_service_candidates():
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(
                    f"{base_url}/caption/adapt",
                    headers=ai_service_headers(),
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
            last_error = exc

    logger.warning("AI service unavailable (%s); using local fallback.", last_error)
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

    last_error: Exception | None = None
    for base_url in _ai_service_candidates():
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(
                    f"{base_url}/caption/detect-language",
                    headers=ai_service_headers(),
                    json={"text": cleaned},
                )
                response.raise_for_status()
                data = response.json()
                language = str(data.get("language", "english")).lower()
                if language not in {"english", "nigerian_pidgin", "yoruba", "code_switch"}:
                    return _local_detect_language(cleaned)
                return data
        except Exception as exc:
            last_error = exc

    logger.warning("AI language detection unavailable (%s); using local fallback.", last_error)
    return _local_detect_language(cleaned)


def generate_content_ideas(payload: dict) -> dict:
    last_error: Exception | None = None
    for base_url in _ai_service_candidates():
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.post(
                    f"{base_url}/ideas/generate",
                    headers=ai_service_headers(),
                    json=payload,
                )
                response.raise_for_status()
                return response.json()
        except Exception as exc:
            last_error = exc

    logger.warning("AI idea generation unavailable (%s); using local fallback.", last_error)
    return _local_brainstorm(payload)


def _local_compose(payload: dict) -> dict:
    topic = str(payload.get("prompt", "content idea")).strip()
    platform = str(payload.get("platform", "instagram")).strip().lower()
    language = str(payload.get("language", "english")).strip().lower()
    tone = str(payload.get("tone", "conversational")).strip()
    creator_memory = payload.get("creator_memory", {}) if isinstance(payload.get("creator_memory", {}), dict) else {}
    keywords = _extract_keywords(topic, max_items=4)
    primary = keywords[0] if keywords else "content"
    secondary = keywords[1] if len(keywords) > 1 else primary
    hashtags = _contextual_hashtags(topic, platform, language)
    memory_hint = _memory_hint(creator_memory)

    content_plan = {
        "title": f"{primary.title()} content plan",
        "angle": f"Turn the request into a {tone} post with one clear idea, one example, and one practical takeaway.",
        "hook": f"I want to show you a simpler way to approach {primary}.",
        "intro": f"Open with the problem around {primary} in one direct sentence.",
        "body": [
            f"Explain the core idea behind {primary} in plain language.",
            f"Add one real example that makes the idea useful for {secondary}.",
            "Close with a next step the audience can try today.",
        ],
        "cta": "Ask people to reply with their version of the idea.",
        "hashtags": hashtags,
    }
    if memory_hint:
        content_plan["body"].append(f"Include this creator note naturally: {memory_hint}")

    return {
        "assistant_message": f"Got it. I turned your prompt into a usable plan: {content_plan['title']}.",
        "content_plan": content_plan,
        "follow_up_question": "Do you want it shorter, more bold, or more local?",
        "model": "backend-local-compose",
        "prompt_template_version": "compose-v1",
        "latency_ms": 0,
        "usage": {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None},
    }


def generate_composed_content(payload: dict) -> dict:
    last_error: Exception | None = None
    for base_url in _ai_service_candidates():
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"{base_url}/compose",
                    headers=ai_service_headers(),
                    json=payload,
                )
                response.raise_for_status()
                return response.json()
        except Exception as exc:
            last_error = exc

    logger.warning("AI compose unavailable (%s); using local fallback.", last_error)
    return _local_compose(payload)

