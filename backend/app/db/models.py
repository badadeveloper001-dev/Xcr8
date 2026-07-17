from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, Boolean, DateTime, Enum as SqlEnum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class Platform(str, Enum):
    instagram = "instagram"
    tiktok = "tiktok"
    x = "x"
    linkedin = "linkedin"
    facebook = "facebook"
    youtube_shorts = "youtube_shorts"
    threads = "threads"


class PostStatus(str, Enum):
    draft = "draft"
    pending_approval = "pending_approval"
    approved = "approved"
    scheduled = "scheduled"
    published = "published"
    failed = "failed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120), default="Creator")
    language: Mapped[str] = mapped_column(String(32), default="english")
    timezone: Mapped[str] = mapped_column(String(64), default="Africa/Lagos")
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    profile: Mapped[CreatorProfile] = relationship(back_populates="user", uselist=False)
    auth_credential: Mapped[AuthCredential] = relationship(back_populates="user", uselist=False)
    posts: Mapped[list[ContentPost]] = relationship(back_populates="user")
    connected_platforms: Mapped[list[ConnectedPlatform]] = relationship(back_populates="user")
    schedules: Mapped[list[ScheduledPost]] = relationship(back_populates="user")
    memories: Mapped[list[CreatorMemory]] = relationship(back_populates="user")
    analytics: Mapped[list[AnalyticsSnapshot]] = relationship(back_populates="user")
    trend_signals: Mapped[list[TrendSignalEvent]] = relationship(back_populates="user")
    intelligence_feedback: Mapped[list[IntelligenceFeedback]] = relationship(back_populates="user")
    intelligence_notifications: Mapped[list[IntelligenceNotification]] = relationship(back_populates="user")
    pulse_events: Mapped[list[PulseEvent]] = relationship(back_populates="user")
    pulse_affected_incidents: Mapped[list[PulseAffectedUser]] = relationship(back_populates="user")


class CreatorProfile(Base):
    __tablename__ = "creator_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    niche: Mapped[str] = mapped_column(String(120), default="creator")
    tone: Mapped[str] = mapped_column(String(120), default="confident")
    emoji_style: Mapped[str] = mapped_column(String(255), default="🔥✨")
    slang_profile: Mapped[str] = mapped_column(String(255), default="light")
    multilingual_profile: Mapped[list[str]] = mapped_column(JSON, default=list)
    preferred_caption_length: Mapped[int] = mapped_column(Integer, default=120)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)

    user: Mapped[User] = relationship(back_populates="profile")


class AuthCredential(Base):
    __tablename__ = "auth_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(Text)
    password_salt: Mapped[str] = mapped_column(Text)
    password_reset_token_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    remember_me_default: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped[User] = relationship(back_populates="auth_credential")


class ConnectedPlatform(Base):
    __tablename__ = "connected_platforms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    platform: Mapped[Platform] = mapped_column(SqlEnum(Platform), index=True)
    account_handle: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    auth_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="connected_platforms")


class ContentPost(Base):
    __tablename__ = "content_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(180), default="Untitled Post")
    media_type: Mapped[str] = mapped_column(String(32), default="image")
    media_url: Mapped[str] = mapped_column(Text)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    master_caption: Mapped[str] = mapped_column(Text)
    primary_language: Mapped[str] = mapped_column(String(32), default="english")
    selected_platforms: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[PostStatus] = mapped_column(SqlEnum(PostStatus), default=PostStatus.draft)
    content_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="posts")
    variants: Mapped[list[PostVariant]] = relationship(back_populates="post")
    schedules: Mapped[list[ScheduledPost]] = relationship(back_populates="post")
    generations: Mapped[list[AIGeneration]] = relationship(back_populates="post")


class PostVariant(Base):
    __tablename__ = "post_variants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("content_posts.id"), index=True)
    platform: Mapped[Platform] = mapped_column(SqlEnum(Platform), index=True)
    language: Mapped[str] = mapped_column(String(32), default="english")
    adapted_caption: Mapped[str] = mapped_column(Text)
    hashtags: Mapped[list[str]] = mapped_column(JSON, default=list)
    hook: Mapped[str] = mapped_column(String(180), default="")
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    post: Mapped[ContentPost] = relationship(back_populates="variants")


class ScheduledPost(Base):
    __tablename__ = "scheduled_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("content_posts.id"), index=True)
    platform: Mapped[Platform] = mapped_column(SqlEnum(Platform), index=True)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    timezone: Mapped[str] = mapped_column(String(64), default="Africa/Lagos")
    recurring_rule: Mapped[str | None] = mapped_column(String(120), nullable=True)
    queue_status: Mapped[str] = mapped_column(String(32), default="queued")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="schedules")
    post: Mapped[ContentPost] = relationship(back_populates="schedules")


class AIGeneration(Base):
    __tablename__ = "ai_generations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("content_posts.id"), index=True)
    generation_type: Mapped[str] = mapped_column(String(64), default="caption_adaptation")
    model_name: Mapped[str] = mapped_column(String(120), default="gpt-4o-mini")
    input_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    output_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    post: Mapped[ContentPost] = relationship(back_populates="generations")


class CreatorMemory(Base):
    __tablename__ = "creator_memory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    memory_type: Mapped[str] = mapped_column(String(64), default="style")
    memory_key: Mapped[str] = mapped_column(String(120), index=True)
    memory_value: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(JSON, nullable=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.5)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="memories")


class AnalyticsSnapshot(Base):
    __tablename__ = "analytics_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    platform: Mapped[Platform] = mapped_column(SqlEnum(Platform), index=True)
    metric_window: Mapped[str] = mapped_column(String(32), default="7d")
    followers_delta: Mapped[int] = mapped_column(Integer, default=0)
    engagement_rate: Mapped[float] = mapped_column(Float, default=0)
    average_watch_time: Mapped[float] = mapped_column(Float, default=0)
    best_posting_hour: Mapped[int] = mapped_column(Integer, default=20)
    caption_effectiveness: Mapped[float] = mapped_column(Float, default=0)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="analytics")


class TrendSignalEvent(Base):
    __tablename__ = "trend_signal_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    topic: Mapped[str] = mapped_column(String(180), default="creator intelligence")
    platform: Mapped[str] = mapped_column(String(40), default="all", index=True)
    title: Mapped[str] = mapped_column(String(220))
    summary: Mapped[str] = mapped_column(Text)
    source_label: Mapped[str] = mapped_column(String(120), default="xcr8-local-intelligence")
    confidence_score: Mapped[float] = mapped_column(Float, default=0.55)
    momentum_score: Mapped[float] = mapped_column(Float, default=0.5)
    relevance_score: Mapped[float] = mapped_column(Float, default=0.5)
    opportunity_score: Mapped[float] = mapped_column(Float, default=0.5)
    risk_score: Mapped[float] = mapped_column(Float, default=0.25)
    status: Mapped[str] = mapped_column(String(24), default="new", index=True)
    signal_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="trend_signals")
    briefs: Mapped[list[TrendResearchBrief]] = relationship(back_populates="trend_signal")
    recommendations: Mapped[list[TrendRecommendation]] = relationship(back_populates="trend_signal")
    feedback: Mapped[list[IntelligenceFeedback]] = relationship(back_populates="trend_signal")


class TrendResearchBrief(Base):
    __tablename__ = "trend_research_briefs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trend_signal_id: Mapped[int] = mapped_column(ForeignKey("trend_signal_events.id"), index=True)
    what_is_happening: Mapped[str] = mapped_column(Text)
    why_it_matters: Mapped[str] = mapped_column(Text)
    who_is_using_it: Mapped[str] = mapped_column(Text)
    why_it_performs: Mapped[str] = mapped_column(Text)
    potential_risks: Mapped[str] = mapped_column(Text)
    opportunities: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    trend_signal: Mapped[TrendSignalEvent] = relationship(back_populates="briefs")


class TrendRecommendation(Base):
    __tablename__ = "trend_recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trend_signal_id: Mapped[int] = mapped_column(ForeignKey("trend_signal_events.id"), index=True)
    recommendation_type: Mapped[str] = mapped_column(String(64), default="content_angle")
    content_angle: Mapped[str] = mapped_column(Text)
    story_framework: Mapped[str] = mapped_column(Text)
    brainstorm_seed: Mapped[str] = mapped_column(Text)
    composer_seed: Mapped[str] = mapped_column(Text)
    score: Mapped[float] = mapped_column(Float, default=0.55)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    trend_signal: Mapped[TrendSignalEvent] = relationship(back_populates="recommendations")


class IntelligenceFeedback(Base):
    __tablename__ = "intelligence_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    trend_signal_id: Mapped[int] = mapped_column(ForeignKey("trend_signal_events.id"), index=True)
    action: Mapped[str] = mapped_column(String(32), index=True)
    weight: Mapped[float] = mapped_column(Float, default=0.5)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    user: Mapped[User] = relationship(back_populates="intelligence_feedback")
    trend_signal: Mapped[TrendSignalEvent] = relationship(back_populates="feedback")


class IntelligenceNotification(Base):
    __tablename__ = "intelligence_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(220))
    body: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(24), default="info")
    related_topic: Mapped[str] = mapped_column(String(180), default="creator intelligence")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    user: Mapped[User] = relationship(back_populates="intelligence_notifications")


class PulseEvent(Base):
    __tablename__ = "pulse_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("pulse_incidents.id"), index=True, nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    event_type: Mapped[str] = mapped_column(String(32), default="error", index=True)
    feature: Mapped[str] = mapped_column(String(80), default="unknown", index=True)
    error_type: Mapped[str] = mapped_column(String(32), default="system_error", index=True)
    severity: Mapped[str] = mapped_column(String(24), default="medium", index=True)
    provider: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(220))
    detail: Mapped[str] = mapped_column(Text)
    route: Mapped[str | None] = mapped_column(String(220), nullable=True, index=True)
    method: Mapped[str | None] = mapped_column(String(12), nullable=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    request_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    fingerprint: Mapped[str] = mapped_column(String(160), index=True)
    response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    affected_user_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    event_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    incident: Mapped[PulseIncident | None] = relationship(back_populates="events")
    user: Mapped[User | None] = relationship(back_populates="pulse_events")


class PulseIncident(Base):
    __tablename__ = "pulse_incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    feature: Mapped[str] = mapped_column(String(80), default="unknown", index=True)
    error_type: Mapped[str] = mapped_column(String(32), default="system_error", index=True)
    severity: Mapped[str] = mapped_column(String(24), default="medium", index=True)
    provider: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(220))
    possible_reason: Mapped[str] = mapped_column(Text, default="Unknown")
    status: Mapped[str] = mapped_column(String(24), default="investigating", index=True)
    total_events_count: Mapped[int] = mapped_column(Integer, default=0)
    affected_users_count: Mapped[int] = mapped_column(Integer, default=0)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_founder_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    incident_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True
    )

    events: Mapped[list[PulseEvent]] = relationship(back_populates="incident")
    affected_users: Mapped[list[PulseAffectedUser]] = relationship(back_populates="incident")
    notifications: Mapped[list[PulseNotification]] = relationship(back_populates="incident")


class PulseAffectedUser(Base):
    __tablename__ = "pulse_affected_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("pulse_incidents.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    latest_event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    notified_issue_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notified_resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="affected", index=True)

    incident: Mapped[PulseIncident] = relationship(back_populates="affected_users")
    user: Mapped[User | None] = relationship(back_populates="pulse_affected_incidents")


class PulseNotification(Base):
    __tablename__ = "pulse_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("pulse_incidents.id"), index=True)
    channel: Mapped[str] = mapped_column(String(32), index=True)
    notification_type: Mapped[str] = mapped_column(String(32), index=True)
    target: Mapped[str] = mapped_column(String(255), index=True)
    delivery_status: Mapped[str] = mapped_column(String(24), default="sent", index=True)
    response_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    incident: Mapped[PulseIncident] = relationship(back_populates="notifications")
