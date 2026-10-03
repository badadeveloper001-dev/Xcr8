from __future__ import annotations

from contextvars import ContextVar, Token
from threading import Lock
from typing import Literal

from sqlalchemy import event
from sqlalchemy.orm import Session as OrmSession, with_loader_criteria

from app.db.models import (
    AnalyticsSnapshot,
    ConnectedPlatform,
    ContentPost,
    CreatorMemory,
    IntelligenceFeedback,
    IntelligenceNotification,
    ScheduledPost,
    TrendSignalEvent,
)

ProfileScope = Literal["unscoped", "main"] | int

_profile_scope: ContextVar[ProfileScope] = ContextVar("xcr8_profile_scope", default="unscoped")
_schema_ready = False
_schema_lock = Lock()

SCOPED_MODELS = (
    ConnectedPlatform,
    ContentPost,
    ScheduledPost,
    CreatorMemory,
    AnalyticsSnapshot,
    TrendSignalEvent,
    IntelligenceFeedback,
    IntelligenceNotification,
)


def set_profile_scope(value: ProfileScope) -> Token:
    return _profile_scope.set(value)


def reset_profile_scope(token: Token) -> None:
    _profile_scope.reset(token)


def current_profile_id() -> int | None:
    value = _profile_scope.get()
    return value if isinstance(value, int) else None


def current_profile_scope() -> ProfileScope:
    return _profile_scope.get()


@event.listens_for(OrmSession, "do_orm_execute")
def _apply_profile_filter(execute_state) -> None:
    if not execute_state.is_select:
        return
    if execute_state.execution_options.get("skip_profile_scope"):
        return

    scope = _profile_scope.get()
    if scope == "unscoped":
        return

    statement = execute_state.statement
    for model in SCOPED_MODELS:
        criterion = model.workspace_id.is_(None) if scope == "main" else model.workspace_id == scope
        statement = statement.options(
            with_loader_criteria(model, criterion, include_aliases=True)
        )
    execute_state.statement = statement


@event.listens_for(OrmSession, "before_flush")
def _assign_profile_to_new_records(session, _flush_context, _instances) -> None:
    scope = _profile_scope.get()
    if scope == "unscoped":
        return

    workspace_id = None if scope == "main" else int(scope)
    for item in session.new:
        if isinstance(item, SCOPED_MODELS) and getattr(item, "workspace_id", None) is None:
            item.workspace_id = workspace_id
