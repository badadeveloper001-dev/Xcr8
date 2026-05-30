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


class ContentIdeaRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=180)
    platform: str = Field(default="instagram", max_length=40)
    language: str = Field(default="english", max_length=32)
    goal: str = Field(default="grow audience", max_length=120)
    tone: str = Field(default="conversational", max_length=80)
    audience_location: str | None = None
    creator_memory: dict = Field(default_factory=dict)


class ContentIdea(BaseModel):
    title: str
    angle: str
    hook: str
    caption_seed: str
    cta: str
    hashtags: list[str] = Field(default_factory=list)


class ContentIdeaResponse(BaseModel):
    topic: str
    platform: str
    language: str
    goal: str
    model: str
    prompt_template_version: str
    latency_ms: int = 0
    ideas: list[ContentIdea]
    usage: dict = Field(default_factory=dict)
