from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class AuthSignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)
    language: str = "english"
    timezone: str = "Africa/Lagos"


class AuthLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    remember_me: bool = False


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=16, max_length=512)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class PasswordResetRequestResponse(BaseModel):
    message: str
    reset_url: str | None = None


class AuthSessionResponse(BaseModel):
    user_id: int
    email: EmailStr
    display_name: str
    full_name: str | None = None
    username: str | None = None
    onboarding_complete: bool
    google_oauth_enabled: bool


class OnboardingRequest(BaseModel):
    user_id: int
    creator_type: str
    platforms_used: list[str]
    content_niche: str
    audience_location: str
    content_goals: list[str]
    posting_frequency: str
    tone: str
    personality: str


class PlatformConnection(BaseModel):
    platform: str
    account_handle: str
    is_active: bool


class DashboardOverview(BaseModel):
    greeting: str
    creator_name: str
    platforms_connected: int
    drafts: int
    scheduled: int
    ai_suggestions: int
    recent_posts: list[dict]
    ai_insights: list[dict]
    connected_platforms: list[PlatformConnection]
    ai_ops: dict | None = None


class DistributionCreateRequest(BaseModel):
    user_id: int
    title: str = "Untitled Post"
    media_url: str
    media_type: str = "image"
    master_caption: str
    primary_language: str = "english"
    selected_platforms: list[str]
    target_languages: list[str] | None = None


class AdaptedVariant(BaseModel):
    platform: str
    language: str
    adapted_caption: str
    hashtags: list[str]
    hook: str
    approved: bool


class DistributionDraftResponse(BaseModel):
    post_id: int
    status: str
    variants: list[AdaptedVariant]


class ApprovalRequest(BaseModel):
    post_id: int
    approvals: list[dict]


class ScheduleRequest(BaseModel):
    user_id: int
    post_id: int
    platform: str
    scheduled_for: datetime
    timezone: str = "Africa/Lagos"
    recurring_rule: str | None = None


class MemoryWriteRequest(BaseModel):
    user_id: int
    memory_type: str
    memory_key: str
    memory_value: str
    confidence_score: float = 0.7


class MemoryVectorHint(BaseModel):
    provider: str
    index_name: str
    embedding_model: str


class AIBrainstormRequest(BaseModel):
    user_id: int
    topic: str = Field(min_length=3, max_length=180)
    platform: str = Field(default="instagram", max_length=40)
    language: str = Field(default="english", max_length=32)
    goal: str = Field(default="grow audience", max_length=120)
    tone: str = Field(default="conversational", max_length=80)
    audience_location: str | None = Field(default=None, max_length=120)


class AIBrainstormIdea(BaseModel):
    title: str
    angle: str
    hook: str
    caption_seed: str
    cta: str
    hashtags: list[str] = Field(default_factory=list)


class AIBrainstormResponse(BaseModel):
    topic: str
    platform: str
    language: str
    goal: str
    model: str
    prompt_template_version: str
    latency_ms: int = 0
    ideas: list[AIBrainstormIdea]
    usage: dict = Field(default_factory=dict)


class AIConversationMessage(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(min_length=1, max_length=8000)


class AIComposeRequest(BaseModel):
    user_id: int
    prompt: str = Field(min_length=3, max_length=2000)
    platform: str = Field(default="instagram", max_length=40)
    language: str = Field(default="english", max_length=32)
    tone: str = Field(default="conversational", max_length=80)
    audience_location: str | None = None
    messages: list[AIConversationMessage] = Field(default_factory=list)


class AIContentPlan(BaseModel):
    title: str
    angle: str
    hook: str
    intro: str
    body: list[str] = Field(default_factory=list)
    cta: str
    hashtags: list[str] = Field(default_factory=list)


class AIComposeResponse(BaseModel):
    assistant_message: str
    content_plan: AIContentPlan
    follow_up_question: str
    model: str
    prompt_template_version: str
    latency_ms: int = 0
    usage: dict = Field(default_factory=dict)


class AIAssistantRequest(BaseModel):
    user_id: int
    message: str = Field(min_length=1, max_length=4000)
    language: str = Field(default="auto", max_length=32)
    tone: str = Field(default="conversational", max_length=80)
    vibe: str | None = Field(default=None, max_length=120)
    messages: list[AIConversationMessage] = Field(default_factory=list)


class AIAssistantResponse(BaseModel):
    assistant_message: str
    follow_up_question: str
    suggested_actions: list[str] = Field(default_factory=list)
    language: str
    tone: str
    model: str
    prompt_template_version: str
    latency_ms: int = 0
    usage: dict = Field(default_factory=dict)
