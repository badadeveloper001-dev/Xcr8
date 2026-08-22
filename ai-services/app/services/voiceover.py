from __future__ import annotations

import json
import logging
import re
from time import perf_counter

import httpx
from openai import OpenAI

from app.core.config import create_chat_completion, settings


logger = logging.getLogger(__name__)
PROMPT_TEMPLATE_VERSION = "voiceover-v1"

SYSTEM_PROMPT = (
    "You are Xcr8 Voiceover Studio, a spoken-script assistant for creators. "
    "Write scripts that sound natural when spoken aloud, with clear pacing, strong openings, and concise beats. "
    "Always stay in the same language as the user's request unless they explicitly ask otherwise. "
    "Use creator_memory for personalization and never invent facts that are not present. "
    "Return strict JSON with keys: script_title, hook, voiceover_script, beat_breakdown, pacing_notes, delivery_notes, alt_openers, cta, estimated_duration_seconds. "
    "voiceover_script should read like a voiceover draft, not bullet points."
)

VOICE_STYLE_TO_TTS_VOICE = {
    "warm": "nova",
    "confident": "alloy",
    "calm": "echo",
    "high-energy": "fable",
    "premium": "onyx",
}

PACE_TO_SPEED = {
    "slow": 0.9,
    "steady": 1.0,
    "fast": 1.1,
    "punchy": 1.05,
}


def _compact_text(value: str, limit: int = 260) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "..."


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


def _fallback_voiceover(payload: dict) -> dict:
    topic = str(payload.get("topic", "your idea")).strip()
    platform = str(payload.get("platform", "instagram")).strip()
    language = str(payload.get("language", "english")).strip()
    tone = str(payload.get("tone", "conversational")).strip()
    goal = str(payload.get("goal", "engage viewers")).strip()
    voice_style = str(payload.get("voice_style", "warm")).strip()
    duration_seconds = int(payload.get("duration_seconds", 60) or 60)
    creator_memory = (
        payload.get("creator_memory", {})
        if isinstance(payload.get("creator_memory", {}), dict)
        else {}
    )
    keywords = _extract_keywords(topic, max_items=3)
    primary = keywords[0] if keywords else topic
    memory_hint = _memory_hint(creator_memory)

    beat_breakdown = [
        f"Open with the core promise around {primary}.",
        "Explain the value in one short, spoken sentence.",
        "Add one concrete example the audience can picture quickly.",
        f"Close with a direct next step that matches the goal: {goal}.",
    ]
    delivery_notes = [
        f"Keep the tone {tone} and the voice {voice_style}.",
        f"Aim for roughly {duration_seconds} seconds on {platform}.",
        "Pause briefly after the hook so the first line lands.",
    ]
    if memory_hint:
        delivery_notes.append(f"Weave in this creator note naturally: {memory_hint}")

    script_lines = [
        f"If you want a simpler way to think about {primary}, start here.",
        "One clear idea, one real example, and one practical move is usually enough.",
        f"That is the kind of approach that helps people actually {goal}.",
        "Keep it short, keep it human, and let the next step feel obvious.",
    ]

    return {
        "script_title": f"{primary.title()} Voiceover Script",
        "hook": f"If you want a simpler way to think about {primary}, start here.",
        "voiceover_script": " ".join(script_lines),
        "beat_breakdown": beat_breakdown,
        "pacing_notes": [
            "Use a calm opening, then slightly speed up through the middle.",
            "Land the CTA with a deliberate pause.",
        ],
        "delivery_notes": delivery_notes,
        "alt_openers": [
            f"Here is the simplest way to explain {primary}.",
            f"This is the version of {primary} I wish someone told me sooner.",
            f"If {primary} feels confusing, make it this simple.",
        ],
        "cta": "Ask people to try this and reply with what they want to make next.",
        "estimated_duration_seconds": duration_seconds,
        "platform": platform,
        "language": language,
        "tone": tone,
        "voice_style": voice_style,
        "model": "voiceover-local-fallback-no-api-key",
        "prompt_template_version": PROMPT_TEMPLATE_VERSION,
        "latency_ms": 0,
        "usage": {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None},
    }


def generate_voiceover_script(payload: dict) -> dict:
    if not settings.openai_api_key:
        return _fallback_voiceover(payload)

    topic = str(payload.get("topic", "your idea")).strip()
    platform = str(payload.get("platform", "instagram")).strip()
    language = str(payload.get("language", "english")).strip()
    tone = str(payload.get("tone", "conversational")).strip()
    goal = str(payload.get("goal", "engage viewers")).strip()
    pace = str(payload.get("pace", "steady")).strip()
    voice_style = str(payload.get("voice_style", "warm")).strip()
    duration_seconds = int(payload.get("duration_seconds", 60) or 60)
    creator_memory = (
        payload.get("creator_memory", {})
        if isinstance(payload.get("creator_memory", {}), dict)
        else {}
    )
    messages = payload.get("messages", []) if isinstance(payload.get("messages", []), list) else []

    client = OpenAI(api_key=settings.openai_api_key)
    started = perf_counter()

    try:
        completion = create_chat_completion(client,
            model=settings.openai_model,
            temperature=0.75,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "topic": topic,
                            "platform": platform,
                            "language": language,
                            "tone": tone,
                            "goal": goal,
                            "pace": pace,
                            "voice_style": voice_style,
                            "duration_seconds": duration_seconds,
                            "creator_memory": creator_memory,
                            "conversation": messages[-8:],
                            "constraints": {
                                "prompt_template_version": PROMPT_TEMPLATE_VERSION,
                                "voiceover_script_max_chars": 1400,
                                "beat_breakdown_min": 4,
                                "beat_breakdown_max": 6,
                            },
                        }
                    ),
                },
            ],
        )

        raw = completion.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        beat_breakdown = parsed.get("beat_breakdown", [])
        pacing_notes = parsed.get("pacing_notes", [])
        delivery_notes = parsed.get("delivery_notes", [])
        alt_openers = parsed.get("alt_openers", [])

        if not isinstance(beat_breakdown, list):
            beat_breakdown = []
        if not isinstance(pacing_notes, list):
            pacing_notes = []
        if not isinstance(delivery_notes, list):
            delivery_notes = []
        if not isinstance(alt_openers, list):
            alt_openers = []

        voiceover_script = _compact_text(str(parsed.get("voiceover_script", "")).strip(), 1400)
        if not voiceover_script:
            return _fallback_voiceover(payload)

        return {
            "script_title": _compact_text(
                str(parsed.get("script_title", f"{topic.title()} Voiceover Script")).strip(),
                90,
            ),
            "hook": _compact_text(str(parsed.get("hook", "")).strip(), 220),
            "voiceover_script": voiceover_script,
            "beat_breakdown": [str(item).strip() for item in beat_breakdown if str(item).strip()][:6],
            "pacing_notes": [str(item).strip() for item in pacing_notes if str(item).strip()][:5],
            "delivery_notes": [str(item).strip() for item in delivery_notes if str(item).strip()][:5],
            "alt_openers": [str(item).strip() for item in alt_openers if str(item).strip()][:4],
            "cta": _compact_text(str(parsed.get("cta", "")).strip(), 220),
            "estimated_duration_seconds": int(
                parsed.get("estimated_duration_seconds", duration_seconds) or duration_seconds
            ),
            "platform": platform,
            "language": language,
            "tone": tone,
            "voice_style": voice_style,
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
        logger.warning("OpenAI voiceover generation failed; using fallback: %s", exc)
        fallback = _fallback_voiceover(payload)
        fallback["model"] = "voiceover-local-fallback-after-openai-error"
        fallback["latency_ms"] = int((perf_counter() - started) * 1000)
        return fallback


def generate_voiceover_audio(payload: dict) -> bytes:
    if not settings.openai_api_key:
        raise RuntimeError("OpenAI API key is not configured for voiceover audio generation.")

    provided_text = str(payload.get("text") or "").strip()
    if provided_text:
        text = _compact_text(provided_text, 4096)
    else:
        script_result = generate_voiceover_script(payload)
        text = _compact_text(
            " ".join(
                [
                    str(script_result.get("hook") or "").strip(),
                    str(script_result.get("voiceover_script") or "").strip(),
                    str(script_result.get("cta") or "").strip(),
                ]
            ),
            4096,
        )

    if not text:
        raise ValueError("Voiceover text is required.")

    voice_style = str(payload.get("voice_style") or "warm").strip()
    requested_voice_type = str(payload.get("voice_type") or "").strip().lower()
    pace = str(payload.get("pace") or "steady").strip()
    valid_voice_types = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}
    voice = (
        requested_voice_type
        if requested_voice_type in valid_voice_types
        else VOICE_STYLE_TO_TTS_VOICE.get(voice_style, "nova")
    )
    speed = PACE_TO_SPEED.get(pace, 1.0)

    response = httpx.post(
        "https://api.openai.com/v1/audio/speech",
        headers={
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        json={
            "model": settings.openai_tts_model,
            "input": text,
            "voice": voice,
            "response_format": "mp3",
            "speed": speed,
        },
        timeout=120.0,
    )
    response.raise_for_status()
    return response.content
