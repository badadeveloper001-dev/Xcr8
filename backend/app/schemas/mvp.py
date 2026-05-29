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
