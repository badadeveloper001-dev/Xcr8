from __future__ import annotations

import json
import logging
from time import perf_counter

from openai import OpenAI

from app.core.config import settings


logger = logging.getLogger(__name__)
PROMPT_TEMPLATE_VERSION = "assistant-v1"

SYSTEM_PROMPT = (
    "You are Xcr8 Central Assistant, a conversational product guide for creators. "
    "Your job is to help the user with the app, their content, their memories, their uploads, their dashboard, "
    "and their workflow. Speak in the user's language when possible and match their vibe naturally. "
    "If creator_memory.long_chat_memory is provided, use it as conversation history context for continuity. "
    "Be concise, warm, and practical. Never invent facts that are not present in the provided context. "
    "If the user asks about the app, answer using the app context. If the answer is not available, say so plainly and suggest the next best action. "
    "Return strict JSON with keys: assistant_message (string), follow_up_question (string), suggested_actions (array of short strings). "
    "Do not use markdown fences."
)


def _stringify_actions(actions: list[str]) -> list[str]:
    cleaned: list[str] = []
    for item in actions:
        value = str(item).strip()
        if value and value not in cleaned:
            cleaned.append(value)
    return cleaned[:4]


def _build_fallback(payload: dict) -> dict:
    language = str(payload.get("language") or "english").strip() or "english"
    tone = str(payload.get("tone") or "conversational").strip() or "conversational"
    vibe = str(payload.get("vibe") or "").strip()
    app_context = payload.get("app_context") if isinstance(payload.get("app_context"), dict) else {}
    creator_memory = payload.get("creator_memory") if isinstance(payload.get("creator_memory"), dict) else {}
    summary = app_context.get("summary") if isinstance(app_context.get("summary"), dict) else {}
    recent_posts = app_context.get("recent_posts") if isinstance(app_context.get("recent_posts"), list) else []
    memory_facts = creator_memory.get("memory_facts") if isinstance(creator_memory.get("memory_facts"), list) else []

    message = (
        f"I can help with your Xcr8 workspace in a {tone} way and keep the reply in {language}. "
        f"Right now I can see {summary.get('drafts', 0)} drafts, {summary.get('scheduled', 0)} scheduled posts, "
        f"and {summary.get('published', 0)} published posts."
    )
    if vibe:
        message += f" I’m matching your vibe: {vibe}."
    if memory_facts:
        message += f" One thing I remember about you: {memory_facts[0]}."
    if recent_posts:
        latest = recent_posts[0]
        title = latest.get("title") or "your latest post"
        message += f" Your latest post is {title}."

    return {
        "assistant_message": message,
        "follow_up_question": "What should I help you figure out next?",
        "suggested_actions": _stringify_actions([
            "Summarize my dashboard",
            "Review my latest post",
            "Help me plan content",
        ]),
        "language": language,
        "tone": tone,
        "model": "assistant-local-fallback",
        "prompt_template_version": PROMPT_TEMPLATE_VERSION,
        "latency_ms": 0,
        "usage": {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None},
    }


def generate_assistant_reply(payload: dict) -> dict:
    if not settings.openai_api_key:
        return _build_fallback(payload)

    client = OpenAI(api_key=settings.openai_api_key)
    started = perf_counter()

    try:
        completion = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.6,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "prompt_template_version": PROMPT_TEMPLATE_VERSION,
                            "message": payload.get("message", ""),
                            "language": payload.get("language", "english"),
                            "tone": payload.get("tone", "conversational"),
                            "vibe": payload.get("vibe"),
                            "messages": payload.get("messages", []),
                            "app_context": payload.get("app_context", {}),
                            "creator_memory": payload.get("creator_memory", {}),
                        }
                    ),
                },
            ],
        )

        raw = completion.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        assistant_message = str(parsed.get("assistant_message", "")).strip()
        follow_up_question = str(parsed.get("follow_up_question", "What should we do next?")).strip()
        suggested_actions = parsed.get("suggested_actions", [])
        if not isinstance(suggested_actions, list):
            suggested_actions = []

        if not assistant_message:
            return _build_fallback(payload)

        return {
            "assistant_message": assistant_message,
            "follow_up_question": follow_up_question or "What should we do next?",
            "suggested_actions": _stringify_actions([str(item) for item in suggested_actions]),
            "language": str(payload.get("language") or "english").strip() or "english",
            "tone": str(payload.get("tone") or "conversational").strip() or "conversational",
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
        logger.warning("OpenAI assistant generation failed; using fallback: %s", exc)
        fallback = _build_fallback(payload)
        fallback["model"] = "assistant-local-fallback-after-openai-error"
        return fallback