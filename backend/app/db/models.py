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
    posts: Mapped[list[ContentPost]] = relationship(back_populates="user")
    connected_platforms: Mapped[list[ConnectedPlatform]] = relationship(back_populates="user")
    schedules: Mapped[list[ScheduledPost]] = relationship(back_populates="user")
    memories: Mapped[list[CreatorMemory]] = relationship(back_populates="user")
    analytics: Mapped[list[AnalyticsSnapshot]] = relationship(back_populates="user")


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
