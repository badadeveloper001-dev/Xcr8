from __future__ import annotations

import json
import logging
import re
from time import perf_counter

from openai import OpenAI

from app.core.config import settings


logger = logging.getLogger(__name__)
PROMPT_TEMPLATE_VERSION = "assistant-v2"

SYSTEM_PROMPT = (
    "You are Xcr8 Central Assistant, a high-accuracy creator copilot inside the Xcr8 app. "
    "Help with app usage, content strategy, growth decisions, memory continuity, uploads, dashboard interpretation, execution plans, and general knowledge questions. "
    "You can answer broader topics like the world economy, current events, and general explanations. "
    "If the user asks for truly live or fast-changing information, be honest about any limits and give a best-effort answer plus a clear verification step. "
    "Always reply in the same language as the latest user message unless they explicitly request a switch. "
    "Mirror user tone naturally while staying clear and practical. "
    "Use app_context and creator_memory as source-of-truth; never invent unavailable facts. "
    "If information is missing, say what is missing and provide the best safe next step. "
    "Prefer concrete outputs: short plan, checklist, sequence, or decision recommendation. "
    "If relevant tools/routes are available in app_context.feature_catalog, mention them accurately. "
    "Use conversation_memory_digest and recent_chat_turns for continuity when present. "
    "Return strict JSON with keys: assistant_message (string), follow_up_question (string), suggested_actions (array of short strings). "
    "assistant_message should be concise but complete, not telegraphic. No markdown fences."
)


def _compact_text(value: str, limit: int = 280) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "…"


def _extract_recent_chat_turns(creator_memory: dict, limit: int = 8) -> list[dict]:
    raw = creator_memory.get("long_chat_memory")
    if not raw:
        return []

    try:
        parsed = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return []

    if not isinstance(parsed, list):
        return []

    turns: list[dict] = []
    for item in parsed[-limit:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        content = _compact_text(str(item.get("content") or ""), 260)
        if role in {"user", "assistant"} and content:
            turns.append({"role": role, "content": content})
    return turns


def _build_memory_digest(creator_memory: dict) -> str:
    facts = creator_memory.get("memory_facts")
    if not isinstance(facts, list) or not facts:
        return ""

    cleaned = [_compact_text(str(item), 140) for item in facts if str(item).strip()]
    if not cleaned:
        return ""
    return " | ".join(cleaned[:5])


def _intent_suggested_actions(message: str, app_context: dict) -> list[str]:
    msg = str(message or "").lower()
    tools = app_context.get("workspace_map", {}).get("studio_tools", [])
    has = lambda name: any(str(t).lower() == name.lower() for t in tools)

    if any(token in msg for token in ["economy", "inflation", "gdp", "recession", "market", "news", "world"]):
        return _stringify_actions([
            "Explain the topic simply",
            "Summarize key drivers",
            "List what to watch next",
        ])

    if any(token in msg for token in ["caption", "write", "compose", "post", "copy"]):
        actions = ["Open Composer tool", "Draft 3 caption options", "Add CTA + hashtags"]
        if has("Image Generator"):
            actions.append("Generate matching visual")
        return _stringify_actions(actions)

    if any(token in msg for token in ["image", "visual", "thumbnail", "design"]):
        return _stringify_actions([
            "Open Image Generator",
            "Generate 3 visual directions",
            "Pick one and refine prompt",
            "Pair with a caption draft",
        ])

    if any(token in msg for token in ["analytics", "performance", "insight", "growth"]):
        return _stringify_actions([
            "Open Analytics",
            "Review top post pattern",
            "Pick one growth experiment",
            "Schedule follow-up content",
        ])

    return _stringify_actions([
        "Summarize my dashboard",
        "Recommend next best action",
        "Plan this week’s content",
        "Open the right AI tool",
    ])


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
        f"I can help with your Xcr8 workspace and general questions in a {tone} way, keeping the reply in {language}. "
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

    intent_actions = _intent_suggested_actions(payload.get("message", ""), app_context)

    return {
        "assistant_message": message,
        "follow_up_question": "What should I help you figure out next?",
        "suggested_actions": intent_actions,
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
        creator_memory = payload.get("creator_memory", {}) if isinstance(payload.get("creator_memory"), dict) else {}
        app_context = payload.get("app_context", {}) if isinstance(payload.get("app_context"), dict) else {}
        recent_chat_turns = _extract_recent_chat_turns(creator_memory)
        memory_digest = _build_memory_digest(creator_memory)

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
                            "latest_user_message": payload.get("message", ""),
                            "language": payload.get("language", "english"),
                            "tone": payload.get("tone", "conversational"),
                            "vibe": payload.get("vibe"),
                            "messages": payload.get("messages", []),
                            "recent_chat_turns": recent_chat_turns,
                            "conversation_memory_digest": memory_digest,
                            "app_context": app_context,
                            "creator_memory": creator_memory,
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

        intent_actions = _intent_suggested_actions(payload.get("message", ""), app_context)
        merged_actions = _stringify_actions([str(item) for item in suggested_actions] + intent_actions)

        return {
            "assistant_message": assistant_message,
            "follow_up_question": follow_up_question or "What should we do next?",
            "suggested_actions": merged_actions,
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