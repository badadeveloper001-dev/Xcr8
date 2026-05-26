from fastapi import FastAPI

from app.core.config import settings
from app.schemas import AdaptCaptionRequest, AdaptCaptionResponse
from app.services.caption_adapter import adapt_caption

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

