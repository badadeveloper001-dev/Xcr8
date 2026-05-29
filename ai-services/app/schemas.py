from pydantic import BaseModel, Field


class AdaptCaptionRequest(BaseModel):
    text: str
    platform: str
    language: str = "english"
    creator_memory: dict = Field(default_factory=dict)


class AdaptCaptionResponse(BaseModel):
    adapted_caption: str
    hashtags: list[str]
    hook: str
    model: str
    prompt_template_version: str
    latency_ms: int = 0
    usage: dict = Field(default_factory=dict)


class DetectLanguageRequest(BaseModel):
    text: str


class LanguageSegment(BaseModel):
    text: str
    language: str
    confidence: float = 0.0


class DetectLanguageResponse(BaseModel):
    language: str
    confidence: float = 0.0
    method: str
    model: str
    secondary_language: str | None = None
    is_mixed: bool = False
    segments: list[LanguageSegment] = Field(default_factory=list)
