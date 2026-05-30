from fastapi import FastAPI

from app.core.config import settings
from app.schemas import (
    ContentIdeaRequest,
    ContentIdeaResponse,
    AdaptCaptionRequest,
    AdaptCaptionResponse,
    DetectLanguageRequest,
    DetectLanguageResponse,
)
from app.services.idea_generator import generate_content_ideas
from app.services.caption_adapter import adapt_caption, detect_caption_language

app = FastAPI(title="Xcr8 AI Services", version="0.1.0")


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
    }


@app.post("/caption/adapt", response_model=AdaptCaptionResponse)
def caption_adapt(payload: AdaptCaptionRequest) -> AdaptCaptionResponse:
    result = adapt_caption(
        text=payload.text,
        platform=payload.platform,
        language=payload.language,
        creator_memory=payload.creator_memory,
    )
    return AdaptCaptionResponse(**result)


@app.post("/caption/detect-language", response_model=DetectLanguageResponse)
def caption_detect_language(payload: DetectLanguageRequest) -> DetectLanguageResponse:
    result = detect_caption_language(payload.text)
    return DetectLanguageResponse(**result)


@app.post("/ideas/generate", response_model=ContentIdeaResponse)
def ideas_generate(payload: ContentIdeaRequest) -> ContentIdeaResponse:
    result = generate_content_ideas(payload.model_dump())
    return ContentIdeaResponse(**result)

