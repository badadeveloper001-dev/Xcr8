from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class AuthSignupRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=120)
    language: str = "english"
    timezone: str = "Africa/Lagos"


class AuthSessionResponse(BaseModel):
    user_id: int
    email: EmailStr
    display_name: str
    onboarding_complete: bool
    google_oauth_enabled: bool


class OnboardingRequest(BaseModel):
    user_id: int
    niche: str
    tone: str
    emoji_style: str
    slang_profile: str
    multilingual_profile: list[str]


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


class DistributionCreateRequest(BaseModel):
    user_id: int
    title: str = "Untitled Post"
    media_url: str
    media_type: str = "image"
    master_caption: str
    primary_language: str = "english"
    selected_platforms: list[str]
    target_languages: list[str] = ["english"]


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
