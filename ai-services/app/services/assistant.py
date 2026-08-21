from __future__ import annotations

import json
import logging
import re
from time import perf_counter

from openai import OpenAI

from app.core.config import create_chat_completion, settings


logger = logging.getLogger(__name__)
PROMPT_TEMPLATE_VERSION = "assistant-v6"

# Everyday creator tasks stay fast and cost-aware. Strategic work automatically receives
# the stronger reasoning model; creators never have to choose a mode themselves.
_DEEP_REASONING_CUES = (
    "campaign", "strategy", "strategic", "go-to-market", "content plan", "content calendar",
    "seven day", "7-day", "30-day", "roadmap", "deep research", "research report",
    "competitive", "competitor", "trend research", "viral analysis", "why did", "why did this",
    "performance analysis", "analytics analysis", "funnel", "positioning", "launch plan",
)


def _requires_deep_reasoning(message: str) -> bool:
    normalized = re.sub(r"\s+", " ", str(message or "").lower()).strip()
    return any(cue in normalized for cue in _DEEP_REASONING_CUES)


def _select_assistant_model(message: str) -> str:
    if _requires_deep_reasoning(message):
        return str(settings.openai_high_reasoning_model or settings.openai_model).strip()
    return str(settings.openai_model).strip()

# ── Web search helper ──────────────────────────────────────────────────────────

def _web_search(query: str, max_results: int = 5) -> list[dict]:
    """Run a DuckDuckGo text search and return compact result dicts."""
    try:
        from duckduckgo_search import DDGS  # type: ignore
        with DDGS() as ddgs:
            raw = list(ddgs.text(query, max_results=max_results))
        results = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            body = str(item.get("body") or "").strip()[:400]
            href = str(item.get("href") or "").strip()
            if title or body:
                results.append({"title": title, "snippet": body, "url": href})
        return results
    except Exception as exc:
        logger.warning("Web search failed: %s", exc)
        return []


def _needs_web_search(message: str) -> bool:
    """Return True when the user's message likely needs live internet data."""
    lower = str(message or "").lower()
    search_triggers = [
        # Explicit intent
        "search", "look up", "google", "find out", "browse", "check online",
        "search the internet", "search the web", "look online",
        # Current events
        "latest", "recent", "today", "this week", "right now", "currently",
        "news", "trending", "what happened", "what's happening",
        "new update", "just released", "new feature", "new model",
        # Research
        "what is", "who is", "how does", "explain", "definition of",
        "price of", "cost of", "how much is",
        # Social / platform-specific research
        "algorithm", "platform update", "instagram update", "tiktok update",
        "youtube update", "facebook update", "meta update", "threads update",
        # Creator research and trend work should be current by default.
        "trend", "research", "competitor", "competitors", "content ideas", "viral",
        "campaign", "creator economy", "social media update", "policy update",
    ]
    return any(trigger in lower for trigger in search_triggers)


def _format_search_results(results: list[dict]) -> str:
    if not results:
        return ""
    lines = ["[Web search results]"]
    for i, r in enumerate(results, 1):
        lines.append(f"{i}. {r['title']}")
        if r["snippet"]:
            lines.append(f"   {r['snippet']}")
        if r["url"]:
            lines.append(f"   Source: {r['url']}")
    return "\n".join(lines)

SYSTEM_PROMPT = (
    "You are Cr8or AI, the single creator copilot and content workspace inside the Xcr8 app. "
    "Help with app usage, brainstorming, composing platform-ready content, growth decisions, memory continuity, uploads, dashboard interpretation, execution plans, and general knowledge questions. "
    "You own the full thinking-to-draft workflow: do not direct users to separate Brainstorm or Composer tools. "
    "For brainstorming, offer 3-5 differentiated ideas with an angle, hook, CTA, and best-fit platform. "
    "For composition, produce a ready-to-edit draft with a hook, body, CTA, and relevant hashtags; adapt it to the requested platform and tone. "
    "For analytics questions, clearly separate observed signals from hypotheses, explain what may be working, and propose one measurable next test. "
    "You have access to real-time web search results. When web_search_results are provided in the context, use them to give up-to-date, accurate answers — cite each factual current claim with the relevant source URL and include the date when material. "
    "For trend research, distinguish live web evidence, workspace evidence, and informed hypotheses. Never present a hypothesis as a confirmed platform trend. "
    "If current information is requested and no search results are available, say so plainly instead of relying on stale knowledge. "
    "For complex questions, reason clearly and provide structured insight instead of shallow summaries. "
    "When useful, include: what matters most, why it matters, and practical implications for creators/business. "
    "Always reply in the same language as the latest user message unless they explicitly request a switch. "
    "Mirror user tone naturally while staying clear and practical. "
    "If the user is playful or funny, respond with light humor and warm creator-friend energy instead of sounding corporate. "
    "If the user writes with emojis, you may use 1-3 relevant emojis naturally. "
    "If the user is serious, urgent, or sensitive, reduce humor and keep a supportive direct tone. "
    "Use app_context and creator_memory as source-of-truth for workspace data; never invent unavailable facts. "
    "Never claim trend counts, performance lifts, or personal facts unless they are explicitly present in app_context/creator_memory or in web_search_results. "
    "If the user asks what you know about them, answer from onboarding, profile, memory, preferences, recent posts, and activity context before saying anything is missing. "
    "When the latest message is in Nigerian Pidgin, Yoruba, or code-switch, stay in that language style naturally and do not switch back to formal English. "
    "If information is missing, say what is missing and provide the best safe next step. "
    "Prefer concrete outputs: short plan, checklist, sequence, or decision recommendation. "
    "If relevant tools/routes are available in app_context.feature_catalog, mention them accurately. "
    "Use conversation_memory_digest and recent_chat_turns for continuity when present. "
    "Return strict JSON with keys: assistant_message (string), follow_up_question (string), suggested_actions (array of short strings). "
    "assistant_message should be concise but complete, not telegraphic. Sound human, not robotic. No markdown fences. "
    "Build trust through accurate continuity: acknowledge the user’s immediate goal or emotion before advising, then use relevant known preferences without reciting their profile. "
    "Do not fake friendship, memories, experiences, or certainty. Never manufacture personal details to sound warm. "
    "Avoid generic opening lines such as I can help with your workspace. Start with a useful, context-aware response instead. "
    "When the user is exploring, offer a thoughtful point of view and one next move; when they are executing, be decisive and brief. "
    "Ask a follow-up question only when it genuinely unlocks the next decision—do not ask one after a self-contained answer. "
    "If correcting yourself, own it plainly and continue with the corrected answer."
)


def _compact_text(value: str, limit: int = 280) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "…"


def _extract_recent_chat_turns(creator_memory: dict, limit: int = 16) -> list[dict]:
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
    return " | ".join(cleaned[:10])


def _infer_creator_friend_persona(recent_chat_turns: list[dict], explicit_vibe: str) -> str:
    vibe_text = str(explicit_vibe or "").strip().lower()
    if any(token in vibe_text for token in ["fun", "humor", "play", "friend", "banter"]):
        return "playful_creator_friend"
    if any(token in vibe_text for token in ["calm", "focus", "serious", "strategy"]):
        return "calm_strategist_friend"

    user_turns = [
        str(turn.get("content") or "").lower()
        for turn in recent_chat_turns
        if isinstance(turn, dict) and str(turn.get("role") or "").lower() == "user"
    ]
    joined = " ".join(user_turns[-6:])
    playful_cues = ["lol", "haha", "lmao", "joke", "meme", "funny", "banter"]
    strategic_cues = ["plan", "strategy", "roadmap", "optimize", "system", "process"]

    playful_score = sum(1 for cue in playful_cues if cue in joined)
    strategic_score = sum(1 for cue in strategic_cues if cue in joined)
    if playful_score > strategic_score:
        return "playful_creator_friend"
    if strategic_score > playful_score:
        return "calm_strategist_friend"
    return "supportive_creator_friend"


def _normalize_follow_up_question(
    assistant_message: str,
    follow_up_question: str,
    recent_chat_turns: list[dict],
) -> str:
    candidate = str(follow_up_question or "").strip()
    if not candidate:
        return ""

    normalized = re.sub(r"\s+", " ", candidate).strip().lower()
    blocked_fragments = [
        "what content would you like to create",
        "what should we do next",
        "what should i help you with next",
        "what would you like to do next",
    ]
    if any(fragment in normalized for fragment in blocked_fragments):
        return ""

    if len(candidate) < 14:
        return ""

    assistant_lower = str(assistant_message or "").lower()
    if "?" in assistant_lower:
        return ""

    recent_assistant_content = [
        str(turn.get("content") or "").lower()
        for turn in recent_chat_turns[-4:]
        if isinstance(turn, dict) and str(turn.get("role") or "").lower() == "assistant"
    ]
    if any(normalized in item for item in recent_assistant_content):
        return ""

    return candidate


def _infer_vibe_profile(message: str, tone: str, explicit_vibe: str) -> dict:
    text = str(message or "")
    lowered = text.lower()
    tone_value = str(tone or "conversational").strip().lower()
    vibe_value = str(explicit_vibe or "").strip().lower()

    playful_cues = [
        "lol",
        "lmao",
        "haha",
        "funny",
        "joke",
        "meme",
        "banter",
        "crack me up",
    ]
    serious_cues = [
        "urgent",
        "asap",
        "important",
        "serious",
        "frustrated",
        "angry",
        "annoyed",
        "issue",
        "error",
        "problem",
    ]
    emoji_chars = re.findall(r"[\U0001F300-\U0001FAFF]", text)

    playful_score = sum(1 for cue in playful_cues if cue in lowered)
    serious_score = sum(1 for cue in serious_cues if cue in lowered)

    if "fun" in tone_value or "play" in tone_value or "casual" in tone_value:
        playful_score += 1
    if "professional" in tone_value or "formal" in tone_value:
        serious_score += 1
    if any(token in vibe_value for token in ["fun", "play", "humor", "friendly", "friend"]):
        playful_score += 1
    if any(token in vibe_value for token in ["formal", "serious", "professional"]):
        serious_score += 1

    if playful_score > serious_score:
        mood = "playful"
    elif serious_score > playful_score:
        mood = "serious"
    else:
        mood = "balanced"

    if mood == "playful":
        emoji_style = "moderate" if emoji_chars else "light"
        humor_mode = "light"
    elif mood == "serious":
        emoji_style = "none"
        humor_mode = "off"
    else:
        emoji_style = "light" if emoji_chars else "none"
        humor_mode = "light" if playful_score else "off"

    return {
        "mood": mood,
        "emoji_style": emoji_style,
        "humor_mode": humor_mode,
        "creator_friend_energy": "high" if mood == "playful" else "medium",
        "user_used_emoji_count": len(emoji_chars),
    }


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
        actions = ["Draft 3 caption options", "Strengthen the hook", "Add CTA + hashtags"]
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
        "Turn an idea into a draft",
    ])


def _stringify_actions(actions: list[str]) -> list[str]:
    cleaned: list[str] = []
    for item in actions:
        value = str(item).strip()
        if value and value not in cleaned:
            cleaned.append(value)
    return cleaned[:4]


def _is_self_knowledge_question(message: str) -> bool:
    lowered = str(message or "").strip().lower()
    prompts = [
        "what do you know about me",
        "tell me about me",
        "what do you know bout me",
        "wetin you know about me",
        "ki lo mo nipa mi",
        "what do you know abeg",
    ]
    return any(prompt in lowered for prompt in prompts)


def _build_fallback(payload: dict) -> dict:
    language = str(payload.get("language") or "english").strip() or "english"
    tone = str(payload.get("tone") or "conversational").strip() or "conversational"
    vibe = str(payload.get("vibe") or "").strip()
    app_context = payload.get("app_context") if isinstance(payload.get("app_context"), dict) else {}
    creator_memory = payload.get("creator_memory") if isinstance(payload.get("creator_memory"), dict) else {}
    summary = app_context.get("summary") if isinstance(app_context.get("summary"), dict) else {}
    recent_posts = app_context.get("recent_posts") if isinstance(app_context.get("recent_posts"), list) else []
    memory_facts = creator_memory.get("memory_facts") if isinstance(creator_memory.get("memory_facts"), list) else []
    onboarding_summary = str(creator_memory.get("onboarding_summary") or "").strip()
    known_user_profile = str(creator_memory.get("known_user_profile") or "").strip()

    user_message = str(payload.get("message", "")).strip()
    recent_chat_turns = payload.get("recent_chat_turns") if isinstance(payload.get("recent_chat_turns"), list) else []
    persona = _infer_creator_friend_persona(recent_chat_turns, vibe)
    vibe_profile = _infer_vibe_profile(user_message, tone, vibe)
    is_general = any(
        token in user_message.lower()
        for token in ["economy", "inflation", "market", "geopolit", "interest rate", "gdp", "news"]
    )
    is_self_knowledge = _is_self_knowledge_question(user_message)

    if is_self_knowledge:
        if language == "nigerian_pidgin":
            message = "From wetin I know, "
        elif language == "yoruba":
            message = "Lati ohun ti mo mo nipa re, "
        elif language == "code_switch":
            message = "From wetin I know about you, "
        else:
            message = "From what I know about you, "

        facts = []
        if known_user_profile:
            facts.append(known_user_profile)
        facts.extend(str(item).strip() for item in memory_facts[:4] if str(item).strip())

        if facts:
            message += "; ".join(facts[:4]) + "."
        else:
            message += "I only have a light profile so far. Go through onboarding or create a bit more so I can personalize better."

        return {
            "assistant_message": message,
            "follow_up_question": "",
            "suggested_actions": _stringify_actions([
                "Summarize my niche",
                "Show what you know about my style",
                "Map my profile to content ideas",
            ]),
            "language": language,
            "tone": tone,
            "model": "assistant-local-fallback",
            "prompt_template_version": PROMPT_TEMPLATE_VERSION,
            "latency_ms": 0,
            "usage": {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None},
        }

    if is_general:
        message = (
            "I can help with broader questions. Let us break this down into key drivers, second-order effects, "
            "and the signals worth monitoring next."
        )
    else:
        message = (
            f"I can help with your Xcr8 workspace in a {tone} style and keep replies in {language}. "
            f"Current workspace summary: {summary.get('drafts', 0)} drafts, {summary.get('scheduled', 0)} scheduled, "
            f"{summary.get('published', 0)} published."
        )

    intent_actions = _intent_suggested_actions(payload.get("message", ""), app_context)

    follow_up = "What should I help with next?"

    return {
        "assistant_message": message,
        "follow_up_question": follow_up,
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
        user_message = str(payload.get("message", ""))
        persona = _infer_creator_friend_persona(recent_chat_turns, str(payload.get("vibe") or ""))
        vibe_profile = _infer_vibe_profile(
            user_message,
            str(payload.get("tone", "conversational")),
            str(payload.get("vibe") or ""),
        )

        # ── Web search ────────────────────────────────────────────────────────
        selected_model = _select_assistant_model(user_message)
        is_deep_reasoning = _requires_deep_reasoning(user_message)

        web_results_text = ""
        if _needs_web_search(user_message):
            search_results = _web_search(user_message, max_results=7 if is_deep_reasoning else 5)
            if search_results:
                web_results_text = _format_search_results(search_results)
                logger.info("Web search for '%s' returned %d results.", user_message[:60], len(search_results))

        completion = create_chat_completion(client,
            model=selected_model,
            temperature=0.75,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "prompt_template_version": PROMPT_TEMPLATE_VERSION,
                            "message": user_message,
                            "latest_user_message": user_message,
                            "language": payload.get("language", "english"),
                            "tone": payload.get("tone", "conversational"),
                            "vibe": payload.get("vibe"),
                            "creator_friend_persona": persona,
                            "vibe_profile": vibe_profile,
                            "messages": payload.get("messages", []),
                            "recent_chat_turns": recent_chat_turns,
                            "conversation_memory_digest": memory_digest,
                            "app_context": app_context,
                            "creator_memory": creator_memory,
                            "web_search_results": web_results_text or None,
                        }
                    ),
                },
            ],
        )

        raw = completion.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        assistant_message = str(parsed.get("assistant_message", "")).strip()
        follow_up_question = str(parsed.get("follow_up_question", "")).strip()
        suggested_actions = parsed.get("suggested_actions", [])
        if not isinstance(suggested_actions, list):
            suggested_actions = []

        if not assistant_message:
            return _build_fallback(payload)

        follow_up_question = _normalize_follow_up_question(
            assistant_message,
            follow_up_question,
            recent_chat_turns,
        )

        intent_actions = _intent_suggested_actions(payload.get("message", ""), app_context)
        merged_actions = _stringify_actions([str(item) for item in suggested_actions] + intent_actions)

        return {
            "assistant_message": assistant_message,
            "follow_up_question": follow_up_question,
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
        fallback_payload = dict(payload)
        if isinstance(fallback_payload.get("creator_memory"), dict):
            fallback_payload["recent_chat_turns"] = _extract_recent_chat_turns(fallback_payload["creator_memory"])
        fallback = _build_fallback(fallback_payload)
        fallback["model"] = "assistant-local-fallback-after-openai-error"
        return fallback