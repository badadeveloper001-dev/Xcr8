from __future__ import annotations

import json
import logging
import os
import re
from time import perf_counter

from openai import OpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)
PROMPT_TEMPLATE_VERSION = "idea-v2"
COMPOSE_TEMPLATE_VERSION = "compose-v1"

IDEA_SYSTEM_PROMPT = (
    "You are Xcr8 Idea Engine. Generate content ideas that feel specific, practical, and creator-native. "
    "Return strict JSON with keys: ideas (array of objects). Each idea object must include title, angle, hook, "
    "caption_seed, cta, hashtags. Avoid generic advice and avoid repeating the same framing across ideas. "
    "Use creator_memory and topic cues to make the ideas feel personal and locally relevant."
)

COMPOSE_SYSTEM_PROMPT = (
    "You are Xcr8 Conversational Composer. The user will describe how they want their content to feel. "
    "Reply like a helpful creative partner. Be conversational, ask at most one short follow-up question, and return "
    "strict JSON with keys: assistant_message (string), content_plan (object), follow_up_question (string). "
    "content_plan must include title, angle, hook, intro, body (array of short sections), cta, hashtags. "
    "Avoid generic lines and make the result feel specific to the user's request and creator memory."
)


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


def _memory_hint(creator_memory: dict) -> str:
    facts = creator_memory.get("memory_facts", [])
    if isinstance(facts, list) and facts:
        first = str(facts[0]).strip()
        if first:
            return first
    return ""


def _make_hashtags(topic: str, platform: str, language: str, max_tags: int = 5) -> list[str]:
    keywords = _extract_keywords(topic, max_items=3)
    base = [
        "#xcr8",
        "#creatoros",
        "#contentstrategy",
        {
            "instagram": "#instagramcreator",
            "tiktok": "#tiktokcreator",
            "x": "#xcreator",
            "linkedin": "#linkedincreator",
            "facebook": "#facebookcreator",
            "youtube_shorts": "#shortscreator",
            "threads": "#threadscreator",
        }.get(platform.lower(), "#creator"),
        {
            "english": "#contentmarketing",
            "nigerian_pidgin": "#naijacreator",
            "yoruba": "#yorubacreator",
            "code_switch": "#afrodigital",
        }.get(language.lower(), "#globalcreator"),
    ]
    dynamic = [f"#{token}" for token in keywords if token.isascii()]
    merged: list[str] = []
    for tag in [*dynamic, *base]:
        if tag not in merged:
            merged.append(tag)
        if len(merged) >= max_tags:
            break
    return merged


def _fallback_ideas(topic: str, platform: str, language: str, goal: str, tone: str, creator_memory: dict) -> list[dict]:
    memory_hint = _memory_hint(creator_memory)
    keywords = _extract_keywords(topic, max_items=3)
    primary = keywords[0] if keywords else topic.strip().split()[0]
    secondary = keywords[1] if len(keywords) > 1 else primary
    hashtags = _make_hashtags(topic, platform, language)

    return [
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


def generate_content_ideas(payload: dict) -> dict:
    topic = str(payload.get("topic", "content ideas")).strip()
    platform = str(payload.get("platform", "instagram")).strip()
    language = str(payload.get("language", "english")).strip()
    goal = str(payload.get("goal", "grow audience")).strip()
    tone = str(payload.get("tone", "conversational")).strip()
    creator_memory = payload.get("creator_memory", {}) if isinstance(payload.get("creator_memory", {}), dict) else {}

    if not settings.openai_api_key:
        return {
            "topic": topic,
            "platform": platform,
            "language": language,
            "goal": goal,
            "model": "idea-local-fallback-no-api-key",
            "prompt_template_version": PROMPT_TEMPLATE_VERSION,
            "latency_ms": 0,
            "ideas": _fallback_ideas(topic, platform, language, goal, tone, creator_memory),
            "usage": {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None},
        }

    client = OpenAI(api_key=settings.openai_api_key)
    started = perf_counter()
    try:
        completion = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.75,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": IDEA_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "topic": topic,
                            "platform": platform,
                            "language": language,
                            "goal": goal,
                            "tone": tone,
                            "audience_location": payload.get("audience_location"),
                            "creator_memory": creator_memory,
                            "constraints": {
                                "ideas_min": 3,
                                "ideas_max": 3,
                                "prompt_template_version": PROMPT_TEMPLATE_VERSION,
                            },
                        }
                    ),
                },
            ],
        )
        raw = completion.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        ideas = parsed.get("ideas", [])
        if not isinstance(ideas, list):
            ideas = []

        normalized: list[dict] = []
        for item in ideas[:3]:
            if not isinstance(item, dict):
                continue
            normalized.append(
                {
                    "title": str(item.get("title", topic.title())).strip(),
                    "angle": str(item.get("angle", "")).strip(),
                    "hook": str(item.get("hook", "")).strip(),
                    "caption_seed": str(item.get("caption_seed", "")).strip(),
                    "cta": str(item.get("cta", "")).strip(),
                    "hashtags": [str(tag).strip() for tag in item.get("hashtags", []) if str(tag).strip().startswith("#")][:5],
                }
            )

        if len(normalized) < 3:
            normalized = _fallback_ideas(topic, platform, language, goal, tone, creator_memory)

        return {
            "topic": topic,
            "platform": platform,
            "language": language,
            "goal": goal,
            "model": completion.model,
            "prompt_template_version": PROMPT_TEMPLATE_VERSION,
            "latency_ms": int((perf_counter() - started) * 1000),
            "ideas": normalized,
            "usage": {
                "prompt_tokens": completion.usage.prompt_tokens if completion.usage else None,
                "completion_tokens": completion.usage.completion_tokens if completion.usage else None,
                "total_tokens": completion.usage.total_tokens if completion.usage else None,
            },
        }
    except Exception as exc:
        logger.warning("OpenAI idea generation failed; using fallback: %s", exc)
        return {
            "topic": topic,
            "platform": platform,
            "language": language,
            "goal": goal,
            "model": "idea-local-fallback-after-openai-error",
            "prompt_template_version": PROMPT_TEMPLATE_VERSION,
            "latency_ms": int((perf_counter() - started) * 1000),
            "ideas": _fallback_ideas(topic, platform, language, goal, tone, creator_memory),
            "usage": {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None},
        }


def _fallback_compose(payload: dict) -> dict:
    prompt = str(payload.get("prompt", "")).strip()
    platform = str(payload.get("platform", "instagram")).strip().lower()
    language = str(payload.get("language", "english")).strip().lower()
    tone = str(payload.get("tone", "conversational")).strip()
    creator_memory = payload.get("creator_memory", {}) if isinstance(payload.get("creator_memory", {}), dict) else {}

    keywords = _extract_keywords(prompt, max_items=4)
    primary = keywords[0] if keywords else "content"
    secondary = keywords[1] if len(keywords) > 1 else primary
    hashtags = _make_hashtags(prompt, platform, language, max_tags=5)
    memory_hint = _memory_hint(creator_memory)

    content_plan = {
        "title": f"{primary.title()} content plan",
        "angle": f"Turn your request into a {tone} post that feels specific, practical, and easy to act on.",
        "hook": f"I want to show you a simpler way to approach {primary}.",
        "intro": f"Start by naming the problem around {primary} in one direct sentence.",
        "body": [
            f"Break down the core idea behind {primary} in plain language.",
            f"Add one real-world example that makes the idea feel useful for {secondary}.",
            f"End with a simple action step the audience can try today.",
        ],
        "cta": "Ask people to reply with their version of the idea so you can refine it with them.",
        "hashtags": hashtags,
    }
    if memory_hint:
        content_plan["body"].append(f"Use this creator note naturally: {memory_hint}")

    return {
        "assistant_message": (
            f"Got it. Here’s a cleaner direction based on what you want: {content_plan['title']}. "
            f"I’ve shaped it to feel {tone} and practical, and I can refine it further if you want it more bold, short, or local."
        ),
        "content_plan": content_plan,
        "follow_up_question": "Do you want me to make this shorter, more bold, or more local?",
        "model": "backend-local-compose",
        "prompt_template_version": COMPOSE_TEMPLATE_VERSION,
        "latency_ms": 0,
        "usage": {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None},
    }


def generate_composed_content(payload: dict) -> dict:
    prompt = str(payload.get("prompt", "")).strip()
    platform = str(payload.get("platform", "instagram")).strip()
    language = str(payload.get("language", "english")).strip()
    tone = str(payload.get("tone", "conversational")).strip()
    creator_memory = payload.get("creator_memory", {}) if isinstance(payload.get("creator_memory", {}), dict) else {}
    messages = payload.get("messages", []) if isinstance(payload.get("messages", []), list) else []

    if not settings.openai_api_key:
        return _fallback_compose(payload)

    client = OpenAI(api_key=settings.openai_api_key)
    started = perf_counter()
    try:
        completion = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.8,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": COMPOSE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "prompt": prompt,
                            "platform": platform,
                            "language": language,
                            "tone": tone,
                            "audience_location": payload.get("audience_location"),
                            "user_id": payload.get("user_id"),
                            "creator_memory": creator_memory,
                            "conversation": messages[-8:],
                            "constraints": {
                                "prompt_template_version": COMPOSE_TEMPLATE_VERSION,
                            },
                        }
                    ),
                },
            ],
        )
        raw = completion.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        content_plan = parsed.get("content_plan", {})
        if not isinstance(content_plan, dict):
            content_plan = {}

        normalized_plan = {
            "title": str(content_plan.get("title", "Untitled content plan")).strip(),
            "angle": str(content_plan.get("angle", "")).strip(),
            "hook": str(content_plan.get("hook", "")).strip(),
            "intro": str(content_plan.get("intro", "")).strip(),
            "body": [str(part).strip() for part in content_plan.get("body", []) if str(part).strip()],
            "cta": str(content_plan.get("cta", "")).strip(),
            "hashtags": [str(tag).strip() for tag in content_plan.get("hashtags", []) if str(tag).strip().startswith("#")][:8],
        }

        if not normalized_plan["body"]:
            normalized_plan["body"] = _fallback_compose(payload)["content_plan"]["body"]

        assistant_message = str(parsed.get("assistant_message", "")).strip()
        if not assistant_message:
            assistant_message = (
                f"I’ve shaped your request into a usable content plan: {normalized_plan['title']}. "
                f"If you want, I can tighten the hook or make it more local."
            )

        follow_up_question = str(parsed.get("follow_up_question", "")).strip() or "Do you want me to make it shorter or more bold?"

        return {
            "assistant_message": assistant_message,
            "content_plan": normalized_plan,
            "follow_up_question": follow_up_question,
            "model": completion.model,
            "prompt_template_version": COMPOSE_TEMPLATE_VERSION,
            "latency_ms": int((perf_counter() - started) * 1000),
            "usage": {
                "prompt_tokens": completion.usage.prompt_tokens if completion.usage else None,
                "completion_tokens": completion.usage.completion_tokens if completion.usage else None,
                "total_tokens": completion.usage.total_tokens if completion.usage else None,
            },
        }
    except Exception as exc:
        logger.warning("OpenAI compose generation failed; using fallback: %s", exc)
        fallback = _fallback_compose(payload)
        fallback["model"] = "backend-local-compose-after-openai-error"
        fallback["latency_ms"] = int((perf_counter() - started) * 1000)
        return fallback
