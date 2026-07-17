from __future__ import annotations

import base64
from time import perf_counter

from openai import OpenAI

from app.core.config import settings

PROMPT_TEMPLATE_VERSION = "image-generator-v2"
QUALITY_SUFFIX = (
    "Create one single premium HD image only. "
    "Photorealistic, clean composition, realistic lighting, accurate anatomy, no text, no watermark, no collage, no duplicate subjects."
)


def _resolve_size(width: int, height: int) -> str:
    if width == height:
        return "1024x1024"
    if width > height:
        return "1536x1024"
    return "1024x1536"


def generate_image(payload: dict) -> dict:
    if not settings.openai_api_key:
        raise RuntimeError("OpenAI image generation is not configured.")

    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("Missing prompt")

    width = int(payload.get("width") or 1024)
    height = int(payload.get("height") or 1280)
    size = _resolve_size(width, height)
    quality = str(payload.get("quality") or "high").strip().lower() or "high"
    if quality not in {"low", "medium", "high"}:
        quality = "high"

    client = OpenAI(api_key=settings.openai_api_key)
    started = perf_counter()
    response = client.images.generate(
        model=settings.openai_image_model,
        prompt=f"{prompt}. {QUALITY_SUFFIX}",
        size=size,
        quality=quality,
        n=1,
    )

    image_base64 = ""
    mime_type = "image/png"
    if getattr(response, "data", None):
        first = response.data[0]
        image_base64 = getattr(first, "b64_json", "") or ""
    if not image_base64:
        raise RuntimeError("Image provider returned no image data.")

    # Validate decodes to image bytes.
    base64.b64decode(image_base64)

    return {
        "mime_type": mime_type,
        "image_base64": image_base64,
        "model": settings.openai_image_model,
        "prompt_template_version": PROMPT_TEMPLATE_VERSION,
        "latency_ms": int((perf_counter() - started) * 1000),
    }
