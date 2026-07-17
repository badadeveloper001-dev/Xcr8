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


class VoiceoverAudioRequest(BaseModel):
    text: str = Field(min_length=3, max_length=6000)
    topic: str | None = Field(default=None, max_length=220)
    language: str = Field(default="english", max_length=32)
    pace: str = Field(default="steady", max_length=40)
    voice_style: str = Field(default="warm", max_length=40)
    voice_type: str = Field(default="nova", max_length=40)
    platform: str = Field(default="instagram", max_length=40)
    tone: str = Field(default="conversational", max_length=80)
    goal: str = Field(default="engage viewers", max_length=120)
    duration_seconds: int = Field(default=60, ge=15, le=180)


class ConversationMessage(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(min_length=1, max_length=8000)


class ComposeRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)
    platform: str = Field(default="instagram", max_length=40)
    language: str = Field(default="english", max_length=32)
    tone: str = Field(default="conversational", max_length=80)
    audience_location: str | None = None
    user_id: int | None = None
    creator_memory: dict = Field(default_factory=dict)
    messages: list[ConversationMessage] = Field(default_factory=list)


class ContentPlan(BaseModel):
    title: str
    angle: str
    hook: str
    intro: str
    body: list[str] = Field(default_factory=list)
    cta: str
    hashtags: list[str] = Field(default_factory=list)


class ComposeResponse(BaseModel):
    assistant_message: str
    content_plan: ContentPlan
    follow_up_question: str
    model: str
    prompt_template_version: str
    latency_ms: int = 0
    usage: dict = Field(default_factory=dict)


class VoiceoverRequest(BaseModel):
    user_id: int
    topic: str = Field(min_length=3, max_length=220)
    platform: str = Field(default="instagram", max_length=40)
    language: str = Field(default="english", max_length=32)
    tone: str = Field(default="conversational", max_length=80)
    audience_location: str | None = None
    goal: str = Field(default="engage viewers", max_length=120)
    duration_seconds: int = Field(default=60, ge=15, le=180)
    pace: str = Field(default="steady", max_length=40)
    voice_style: str = Field(default="warm", max_length=40)
    creator_memory: dict = Field(default_factory=dict)
    messages: list[ConversationMessage] = Field(default_factory=list)


class VoiceoverResponse(BaseModel):
    script_title: str
    hook: str
    voiceover_script: str
    beat_breakdown: list[str] = Field(default_factory=list)
    pacing_notes: list[str] = Field(default_factory=list)
    delivery_notes: list[str] = Field(default_factory=list)
    alt_openers: list[str] = Field(default_factory=list)
    cta: str
    estimated_duration_seconds: int
    platform: str
    language: str
    tone: str
    voice_style: str
    model: str
    prompt_template_version: str
    latency_ms: int = 0
    usage: dict = Field(default_factory=dict)


class AssistantRequest(BaseModel):
    user_id: int
    message: str = Field(min_length=1, max_length=4000)
    language: str = Field(default="auto", max_length=32)
    tone: str = Field(default="conversational", max_length=80)
    vibe: str | None = Field(default=None, max_length=120)
    messages: list[ConversationMessage] = Field(default_factory=list)
    app_context: dict = Field(default_factory=dict)
    creator_memory: dict = Field(default_factory=dict)


class AssistantResponse(BaseModel):
    assistant_message: str
    follow_up_question: str
    suggested_actions: list[str] = Field(default_factory=list)
    language: str
    tone: str
    model: str
    prompt_template_version: str
    latency_ms: int = 0
    usage: dict = Field(default_factory=dict)


class ImageGenerateRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)
    width: int = Field(default=1024, ge=512, le=1792)
    height: int = Field(default=1280, ge=512, le=1792)
    quality: str = Field(default="high", max_length=24)


class ImageGenerateResponse(BaseModel):
    mime_type: str
    image_base64: str
    model: str
    prompt_template_version: str
    latency_ms: int = 0
