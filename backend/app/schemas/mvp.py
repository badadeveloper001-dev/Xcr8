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


class AuthSignupCodeVerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


class AuthSignupLinkVerifyRequest(BaseModel):
    email: EmailStr
    token_hash: str = Field(min_length=8, max_length=512)
    type: str = Field(default="email", pattern=r"^(email|signup)$")


class AuthSignupPasswordVerifyRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class AuthLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    remember_me: bool = False


class AuthGoogleTokenRequest(BaseModel):
    access_token: str = Field(min_length=20, max_length=4096)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=16, max_length=512)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class PasswordResetRequestResponse(BaseModel):
    message: str
    reset_url: str | None = None


class SignupResponse(BaseModel):
    message: str
    requires_verification: bool = True


class AuthSessionResponse(BaseModel):
    user_id: int
    email: EmailStr
    display_name: str
    full_name: str | None = None
    username: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    onboarding_complete: bool
    google_oauth_enabled: bool


class AvatarUpdateRequest(BaseModel):
    user_id: int
    avatar_url: str = Field(min_length=16, max_length=20_000_000)


class AuthProfileUpdateRequest(BaseModel):
    user_id: int
    username: str | None = Field(default=None, min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.-]+$")
    phone: str | None = Field(default=None, max_length=32)


class IntelligenceNotificationReadRequest(BaseModel):
    user_id: int


class OnboardingRequest(BaseModel):
    user_id: int
    creator_type: list[str]
    platforms_used: list[str]
    content_niche: list[str]
    audience_location: list[str]
    content_goals: list[str]
    posting_frequency: list[str]
    tone: list[str]
    personality: list[str]


class PlatformConnection(BaseModel):
    platform: str
    account_handle: str
    is_active: bool


class Cr8orAIAlert(BaseModel):
    title: str
    message: str
    prompt: str
    trend_titles: list[str] = Field(default_factory=list)
    language: str = "english"


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
    cr8or_ai_alert: Cr8orAIAlert | None = None
    ai_ops: dict | None = None


class AdminTopCreatorItem(BaseModel):
    user_id: int
    display_name: str
    email: str
    posts: int
    draft_posts: int
    scheduled: int
    published: int


class AdminSeriesPoint(BaseModel):
    date: str
    value: int


class PulseIncidentItem(BaseModel):
    id: int
    title: str
    feature: str
    error_type: str
    severity: str
    provider: str | None = None
    possible_reason: str
    status: str
    affected_users_count: int
    total_events_count: int
    first_seen_at: str
    last_seen_at: str
    resolved_at: str | None = None
    resolution_summary: str | None = None
    incident_meta: dict = Field(default_factory=dict)


class PulseStatusUpdateRequest(BaseModel):
    status: str = Field(pattern=r"^(investigating|fixed)$")
    resolution_summary: str | None = Field(default=None, max_length=1000)

class PlanUpgradeRequest(BaseModel):
    plan: str = Field(pattern=r"^(free|plus|pro|agency)$")

class PlanResponse(BaseModel):
    user_id: int
    plan: str
    started_at: str | None = None
    expires_at: str | None = None

class PulseEventIngestRequest(BaseModel):
    event_type: str = Field(default="error", max_length=32)
    feature: str | None = Field(default=None, max_length=80)
    route: str | None = Field(default=None, max_length=220)
    method: str | None = Field(default=None, max_length=12)
    http_status: int | None = None
    detail: str = Field(min_length=3, max_length=4000)
    provider: str | None = Field(default=None, max_length=80)
    request_id: str | None = Field(default=None, max_length=80)
    response_ms: int | None = Field(default=None, ge=0)
    user_id: int | None = None
    affected_user_email: str | None = None
    event_meta: dict = Field(default_factory=dict)


class AdminOverview(BaseModel):
    generated_at: str
    total_users: int
    onboarded_users: int
    active_users_7d: int
    total_posts: int
    draft_posts: int
    scheduled_posts: int
    published_posts: int
    ai_generations: int
    trend_signals: int
    pulse_open_incidents: int = 0
    pulse_critical_incidents: int = 0
    top_creators: list[AdminTopCreatorItem] = Field(default_factory=list)
    users_created_7d: list[AdminSeriesPoint] = Field(default_factory=list)
    posts_created_7d: list[AdminSeriesPoint] = Field(default_factory=list)
    ai_generations_7d: list[AdminSeriesPoint] = Field(default_factory=list)


class DistributionCreateRequest(BaseModel):
    user_id: int
    title: str = "Untitled Post"
    media_url: str
    media_urls: list[str] | None = None
    media_types: list[str] | None = None
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


class AITrendMapperRequest(BaseModel):
    user_id: int
    topic: str = Field(min_length=2, max_length=200)
    goal: str = Field(default="grow audience", max_length=120)
    platform: str = Field(default="all", max_length=40)
    window: str = Field(default="30d", pattern=r"^(7d|30d|90d)$")


class AITrendSignal(BaseModel):
    title: str
    why_now: str
    angle: str
    hook: str
    action: str
    platform: str
    confidence_score: float


class AITrendMapperResponse(BaseModel):
    topic: str
    goal: str
    platform: str
    window: str
    generated_at: str
    summary: str
    signals: list[AITrendSignal] = Field(default_factory=list)
    source_stats: dict = Field(default_factory=dict)


class IntelligenceRefreshRequest(BaseModel):
    user_id: int
    interests: list[str] = Field(default_factory=list)
    platform: str = Field(default="all", max_length=40)


class IntelligenceFeedbackRequest(BaseModel):
    user_id: int
    trend_signal_id: int
    action: str = Field(pattern=r"^(viewed|saved|dismissed|brainstormed|composed|published)$")


class IntelligenceResearchBrief(BaseModel):
    what_is_happening: str
    why_it_matters: str
    who_is_using_it: str
    why_it_performs: str
    potential_risks: str
    opportunities: str


class IntelligenceRecommendation(BaseModel):
    recommendation_type: str
    content_angle: str
    story_framework: str
    brainstorm_seed: str
    composer_seed: str
    score: float


class IntelligenceSignal(BaseModel):
    id: int
    topic: str
    platform: str
    title: str
    summary: str
    source_label: str
    confidence_score: float
    momentum_score: float
    relevance_score: float
    opportunity_score: float
    risk_score: float
    status: str
    created_at: str
    brief: IntelligenceResearchBrief
    recommendations: list[IntelligenceRecommendation] = Field(default_factory=list)


class IntelligenceNotificationItem(BaseModel):
    id: int
    title: str
    body: str
    severity: str
    related_topic: str
    is_read: bool
    created_at: str


class IntelligenceFeedResponse(BaseModel):
    user_id: int
    generated_at: str
    summary: str
    interests: list[str] = Field(default_factory=list)
    signals: list[IntelligenceSignal] = Field(default_factory=list)
    notifications: list[IntelligenceNotificationItem] = Field(default_factory=list)
    source_stats: dict = Field(default_factory=dict)


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


class AIVoiceoverRequest(BaseModel):
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
    messages: list[AIConversationMessage] = Field(default_factory=list)


class AIVoiceoverAudioRequest(BaseModel):
    user_id: int
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


class AIVoiceoverResponse(BaseModel):
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


class AIAssistantRequest(BaseModel):
    user_id: int
    email: EmailStr | None = None
    chat_id: str | None = Field(default=None, max_length=120)
    message: str = Field(min_length=1, max_length=4000)
    language: str = Field(default="auto", max_length=32)
    tone: str = Field(default="auto", max_length=80)
    vibe: str | None = Field(default=None, max_length=120)
    messages: list[AIConversationMessage] = Field(default_factory=list)


class AIAssistantResponse(BaseModel):
    chat_id: str | None = None
    assistant_message: str
    follow_up_question: str
    suggested_actions: list[str] = Field(default_factory=list)
    language: str
    tone: str
    model: str
    prompt_template_version: str
    latency_ms: int = 0
    usage: dict = Field(default_factory=dict)


class AIAssistantChatSummary(BaseModel):
    chat_id: str
    title: str
    preview: str
    updated_at: str


class AIAssistantChatHistory(BaseModel):
    chat_id: str
    title: str
    updated_at: str
    messages: list[AIConversationMessage] = Field(default_factory=list)


class AIAssistantChatCreateRequest(BaseModel):
    chat_id: str | None = Field(default=None, max_length=120)
    title: str | None = Field(default=None, max_length=120)
