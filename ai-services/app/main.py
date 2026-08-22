import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import Response

from app.core.config import settings
from app.schemas import (
    AssistantRequest,
    AssistantResponse,
    ContentIdeaRequest,
    ContentIdeaResponse,
    ComposeRequest,
    ComposeResponse,
    AdaptCaptionRequest,
    AdaptCaptionResponse,
    DetectLanguageRequest,
    DetectLanguageResponse,
    ImageGenerateRequest,
    ImageGenerateResponse,
    VoiceoverRequest,
    VoiceoverAudioRequest,
    VoiceoverResponse,
)
from app.services.assistant import generate_assistant_reply
from app.services.idea_generator import generate_composed_content, generate_content_ideas
from app.services.caption_adapter import adapt_caption, detect_caption_language
from app.services.image_generator import generate_image
from app.services.voiceover import generate_voiceover_audio, generate_voiceover_script

app = FastAPI(title="Xcr8 AI Services", version="0.1.0")


def _require_internal_token(
    x_xcr8_internal_token: str | None = Header(default=None, alias="X-Xcr8-Internal-Token"),
) -> None:
    expected = str(
        settings.ai_internal_token or settings.oauth_state_secret or settings.cron_secret or ""
    ).strip()
    if not expected and not os.getenv("VERCEL"):
        return
    if not expected:
        raise HTTPException(status_code=503, detail="AI internal authentication is not configured")
    if not x_xcr8_internal_token or not hmac.compare_digest(x_xcr8_internal_token, expected):
        raise HTTPException(status_code=401, detail="Invalid AI internal token")


INTERNAL_ONLY = [Depends(_require_internal_token)]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-services"}


@app.get("/health/provider")
def health_provider() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "service": "ai-services",
        "provider_configured": bool(settings.openai_api_key),
        "model": settings.openai_model,
        "image_model": settings.openai_image_model,
        "tts_model": settings.openai_tts_model,
    }


@app.post("/caption/adapt", response_model=AdaptCaptionResponse, dependencies=INTERNAL_ONLY)
def caption_adapt(payload: AdaptCaptionRequest) -> AdaptCaptionResponse:
    result = adapt_caption(
        text=payload.text,
        platform=payload.platform,
        language=payload.language,
        creator_memory=payload.creator_memory,
    )
    return AdaptCaptionResponse(**result)


@app.post("/caption/detect-language", response_model=DetectLanguageResponse, dependencies=INTERNAL_ONLY)
def caption_detect_language(payload: DetectLanguageRequest) -> DetectLanguageResponse:
    result = detect_caption_language(payload.text)
    return DetectLanguageResponse(**result)


@app.post("/ideas/generate", response_model=ContentIdeaResponse, dependencies=INTERNAL_ONLY)
def ideas_generate(payload: ContentIdeaRequest) -> ContentIdeaResponse:
    result = generate_content_ideas(payload.model_dump())
    return ContentIdeaResponse(**result)


@app.post("/compose", response_model=ComposeResponse, dependencies=INTERNAL_ONLY)
def compose(payload: ComposeRequest) -> ComposeResponse:
    result = generate_composed_content(payload.model_dump())
    return ComposeResponse(**result)


@app.post("/assistant", response_model=AssistantResponse, dependencies=INTERNAL_ONLY)
def assistant(payload: AssistantRequest) -> AssistantResponse:
    result = generate_assistant_reply(payload.model_dump())
    return AssistantResponse(**result)


@app.post("/image/generate", response_model=ImageGenerateResponse, dependencies=INTERNAL_ONLY)
def image_generate(payload: ImageGenerateRequest) -> ImageGenerateResponse:
    try:
        result = generate_image(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Image provider failed: {exc}") from exc
    return ImageGenerateResponse(**result)


@app.post("/voiceover", response_model=VoiceoverResponse, dependencies=INTERNAL_ONLY)
def voiceover(payload: VoiceoverRequest) -> VoiceoverResponse:
    result = generate_voiceover_script(payload.model_dump())
    return VoiceoverResponse(**result)


@app.post("/voiceover/audio", dependencies=INTERNAL_ONLY)
def voiceover_audio(payload: VoiceoverAudioRequest) -> Response:
    try:
        audio_bytes = generate_voiceover_audio(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Voiceover audio generation failed: {exc}") from exc

    return Response(content=audio_bytes, media_type="audio/mpeg")

