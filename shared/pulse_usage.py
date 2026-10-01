"""Pulse's server-only cost ledger. No prompts, outputs, credentials or runtime DDL.

Amounts are integer USD microdollars; all reporting windows use UTC.
"""
from __future__ import annotations

from contextvars import ContextVar
from datetime import UTC, datetime, timedelta
from decimal import Decimal, ROUND_CEILING
from functools import lru_cache
import logging
import os
from time import perf_counter
import uuid

from sqlalchemy import (MetaData, Table, Column, String, Integer, BigInteger, JSON,
                        DateTime, Index, create_engine, select, update, insert, func, case)
from sqlalchemy.exc import SQLAlchemyError

log = logging.getLogger(__name__)
context: ContextVar[dict | None] = ContextVar("pulse_usage", default=None)
metadata = MetaData()
policy = Table("pulse_cost_policy", metadata,
    Column("id", Integer, primary_key=True), Column("revision", Integer, nullable=False),
    Column("config", JSON, nullable=False))
requests = Table("pulse_ai_requests", metadata,
    Column("id", String(64), primary_key=True), Column("user_id", Integer, nullable=False),
    Column("feature", String(80), nullable=False), Column("status", String(20), nullable=False),
    Column("duration_ms", Integer), Column("created_at", DateTime(timezone=True), nullable=False))
attempts = Table("pulse_ai_attempts", metadata,
    Column("id", String(64), primary_key=True), Column("request_id", String(64), nullable=False),
    Column("user_id", Integer, nullable=False), Column("feature", String(80), nullable=False),
    Column("provider", String(32), nullable=False), Column("model", String(120), nullable=False),
    Column("fallback", Integer, nullable=False), Column("status", String(20), nullable=False),
    Column("input_tokens", BigInteger), Column("output_tokens", BigInteger),
    Column("characters", BigInteger), Column("images", Integer), Column("duration_ms", Integer),
    Column("cost_micros", BigInteger), Column("reserved_micros", BigInteger, nullable=False),
    Column("price_snapshot", JSON, nullable=False), Column("cost_basis", String(32)),
    Column("error_type", String(80)), Column("created_at", DateTime(timezone=True), nullable=False))
events = Table("pulse_value_events", metadata,
    Column("id", String(160), primary_key=True), Column("request_id", String(64)),
    Column("user_id", Integer, nullable=False), Column("feature", String(80), nullable=False),
    Column("event", String(20), nullable=False), Column("source", String(32), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False))
Index("ix_pulse_attempts_time_user", attempts.c.created_at, attempts.c.user_id)
Index("ix_pulse_attempts_request", attempts.c.request_id)
Index("ix_pulse_requests_time_user", requests.c.created_at, requests.c.user_id)
Index("ix_pulse_value_time_user", events.c.created_at, events.c.user_id)

DEFAULT_CONFIG = {"mode": "observe", "prices": {}, "limits": {}, "user_limits": {},
                  "feature_limits": {}, "max_output_tokens": 2048, "max_input_bytes": 64000}


class UsageBlocked(Exception):
    def __init__(self, message="AI usage has reached its budget. Please try again after the budget resets.", status=429):
        super().__init__(message)
        self.status = status


def enabled():
    return os.getenv("PULSE_USAGE_ENABLED", "false").lower() == "true"


@lru_cache(maxsize=4)
def engine_for(url):
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    if url.startswith("postgresql"):
        return create_engine(url, pool_size=2, max_overflow=0, pool_timeout=3,
                             connect_args={"connect_timeout": 3, "options": "-c statement_timeout=5000"})
    return create_engine(url, connect_args={"check_same_thread": False, "timeout": 5})


def engine():
    url = os.getenv("PULSE_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        raise UsageBlocked("AI usage tracking is not configured. Please try again later.", 503)
    return engine_for(url)


def now():
    return datetime.now(UTC)


def windows(at=None):
    at = at or now()
    day = at.replace(hour=0, minute=0, second=0, microsecond=0)
    return {
        "day": day,
        "week": day - timedelta(days=day.weekday()),
        "month": day.replace(day=1),
        "year": day.replace(month=1, day=1),
    }


def read_config(conn):
    row = conn.execute(select(policy.c.config).where(policy.c.id == 1)).scalar_one_or_none()
    if row is None:
        raise UsageBlocked("AI usage tracking needs its database migration. Please try again later.", 503)
    return row


def validate_config(value):
    if not isinstance(value, dict) or set(value) != set(DEFAULT_CONFIG):
        raise ValueError("Provide mode, prices, limits, user_limits, feature_limits, max_output_tokens and max_input_bytes.")
    if value["mode"] not in {"observe", "enforce"}:
        raise ValueError("Mode must be observe or enforce.")
    for name, upper in (("max_output_tokens", 16384), ("max_input_bytes", 256000)):
        if type(value[name]) is not int or not 1 <= value[name] <= upper:
            raise ValueError(f"Invalid {name}.")
    def limit_set(limits):
        if not isinstance(limits, dict) or set(limits) - {"day", "week", "month"}:
            raise ValueError("Limits use UTC day, week or month.")
        if any(type(v) is not int or not 0 <= v <= 10**12 for v in limits.values()):
            raise ValueError("Limits must be nonnegative integer USD microdollars.")
    limit_set(value["limits"])
    for kind in ("user_limits", "feature_limits"):
        if not isinstance(value[kind], dict) or len(value[kind]) > 1000:
            raise ValueError("Invalid scoped limits.")
        for key, limits in value[kind].items():
            if kind == "user_limits" and key != "default" and (not key.isdigit() or int(key) < 1):
                raise ValueError("User limits require a user ID or default.")
            limit_set(limits)
    if not isinstance(value["prices"], dict) or len(value["prices"]) > 100:
        raise ValueError("Invalid price catalog.")
    allowed = {"input_per_million", "output_per_million", "input_cache_hit_per_million", "input_cache_miss_per_million", "input_cache_hit_peak_per_million", "input_cache_miss_peak_per_million", "output_peak_per_million", "per_character", "per_image", "source", "effective_date"}
    for key, rate in value["prices"].items():
        if "/" not in key or not isinstance(rate, dict) or set(rate) - allowed:
            raise ValueError("Prices require provider/model keys and documented rate fields.")
        if not rate.get("source") or not rate.get("effective_date"):
            raise ValueError("Each price needs its source and effective_date.")
        if "input_cache_hit_per_million" in rate and "input_cache_miss_per_million" not in rate and "input_per_million" not in rate:
            raise ValueError("Cache-hit pricing requires an uncached input rate or a cache-miss rate.")
        for field in set(rate) - {"source", "effective_date"}:
            number = Decimal(str(rate[field]))
            if not number.is_finite() or not 0 <= number <= 1000000:
                raise ValueError("Invalid price.")
    return value


def deepseek_peak(at=None):
    at = at or now()
    # DeepSeek defines peak hours as 01:00-04:00 and 06:00-10:00 UTC,
    # Monday through Friday. Chinese public holidays are treated as off-peak
    # because Pulse has no external holiday-calendar dependency.
    if at.weekday() >= 5:
        return False
    minutes = at.hour * 60 + at.minute
    return 60 <= minutes < 240 or 360 <= minutes < 600


def cost(rate, *, input_tokens=None, output_tokens=None, input_cache_hit_tokens=None,
         input_cache_miss_tokens=None, characters=None, images=None, peak=False):
    if not rate:
        return None
    if images is not None and "per_image" in rate:
        amount = Decimal(str(rate["per_image"])) * images * 1000000
    elif characters is not None and "per_character" in rate:
        amount = Decimal(str(rate["per_character"])) * characters * 1000000
    elif input_tokens is not None and output_tokens is not None and "input_cache_hit_per_million" in rate:
        output_key = "output_peak_per_million" if peak and "output_peak_per_million" in rate else "output_per_million"
        output_rate = Decimal(str(rate[output_key]))
        hit_key = "input_cache_hit_peak_per_million" if peak and "input_cache_hit_peak_per_million" in rate else "input_cache_hit_per_million"
        hit_rate = Decimal(str(rate[hit_key]))
        if "input_cache_miss_per_million" in rate:
            miss_key = "input_cache_miss_peak_per_million" if peak and "input_cache_miss_peak_per_million" in rate else "input_cache_miss_per_million"
            miss_rate = Decimal(str(rate[miss_key]))
            if input_cache_hit_tokens is not None and input_cache_miss_tokens is not None:
                amount = hit_rate * input_cache_hit_tokens + miss_rate * input_cache_miss_tokens + output_rate * output_tokens
            else:
                input_rate = max(hit_rate, miss_rate)
                amount = input_rate * input_tokens + output_rate * output_tokens
        elif input_cache_hit_tokens is not None:
            uncached_tokens = max(0, input_tokens - input_cache_hit_tokens)
            amount = hit_rate * input_cache_hit_tokens + Decimal(str(rate["input_per_million"])) * uncached_tokens + output_rate * output_tokens
        elif "input_per_million" in rate:
            amount = Decimal(str(rate["input_per_million"])) * input_tokens + output_rate * output_tokens
        else:
            return None
    elif input_tokens is not None and output_tokens is not None and all(k in rate for k in ("input_per_million", "output_per_million")):
        amount = Decimal(str(rate["input_per_million"])) * input_tokens + Decimal(str(rate["output_per_million"])) * output_tokens
    else:
        return None
    return int(amount.to_integral_value(rounding=ROUND_CEILING))


def start_request(feature):
    ctx = context.get()
    if not enabled():
        return None
    if not ctx or not ctx.get("user_id"):
        raise UsageBlocked("Please sign in again before using AI.", 401)
    ident = uuid.uuid4().hex
    with engine().begin() as conn:
        read_config(conn)
        conn.execute(insert(requests).values(id=ident, user_id=ctx["user_id"], feature=feature,
                                            status="pending", created_at=now()))
    return ident


def finish_request(ident, status, duration):
    if not ident:
        return
    with engine().begin() as conn:
        conn.execute(update(requests).where(requests.c.id == ident).values(status=status, duration_ms=duration))
        if status == "success":
            row = conn.execute(select(requests).where(requests.c.id == ident)).mappings().one()
            put_event(conn, f"generated:{ident}", row["user_id"], row["feature"], "generated", ident, "server")


def put_event(conn, ident, user_id, feature, event, request_id=None, source="server"):
    # Dialect-specific conflict handling makes retries idempotent without aborting the transaction.
    if conn.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as upsert
    else:
        from sqlalchemy.dialects.sqlite import insert as upsert
    conn.execute(upsert(events).values(id=ident, user_id=user_id, feature=feature, event=event,
        request_id=request_id, source=source, created_at=now()).on_conflict_do_nothing(index_elements=["id"]))


def begin_attempt(provider, model, fallback, units):
    ctx = context.get()
    if not enabled():
        return None, {}
    if not ctx or not ctx.get("request_id") or not ctx.get("user_id"):
        raise UsageBlocked("AI request identity is missing. Please sign in again.", 401)
    ident = uuid.uuid4().hex
    with engine().begin() as conn:
        # One short row lock serializes admission across all workers; never held during provider I/O.
        locked = conn.execute(update(policy).where(policy.c.id == 1).values(revision=policy.c.revision))
        if locked.rowcount != 1:
            raise UsageBlocked("AI usage tracking needs its migration.", 503)
        cfg = read_config(conn)
        rate = cfg["prices"].get(f"{provider}/{model}", {})
        reserve_units = dict(units or {})
        if provider == "deepseek" and rate.get("input_cache_hit_per_million"):
            reserve_units.setdefault("peak", deepseek_peak())
        reserve = cost(rate, **reserve_units)
        if cfg["mode"] == "enforce" and reserve is None:
            raise UsageBlocked("This AI tool is temporarily unavailable while its usage rate is configured.", 503)
        scopes = [(cfg["limits"], None),
                  (cfg["user_limits"].get(str(ctx["user_id"]), cfg["user_limits"].get("default", {})), attempts.c.user_id == ctx["user_id"]),
                  (cfg["feature_limits"].get(ctx["feature"], {}), attempts.c.feature == ctx["feature"])]
        for limits, condition in scopes:
            for period, limit in limits.items():
                query = select(func.coalesce(func.sum(func.coalesce(attempts.c.cost_micros, attempts.c.reserved_micros)), 0)).where(attempts.c.created_at >= windows()[period])
                if condition is not None:
                    query = query.where(condition)
                used = conn.execute(query).scalar_one()
                if cfg["mode"] == "enforce" and used + (reserve or 0) > limit:
                    raise UsageBlocked()
        conn.execute(insert(attempts).values(id=ident, request_id=ctx["request_id"], user_id=ctx["user_id"],
            feature=ctx["feature"], provider=provider, model=model, fallback=int(fallback), status="pending",
            reserved_micros=reserve or 0, price_snapshot=rate, created_at=now()))
    return ident, rate


def provider_call(provider, model, call, *, fallback=False, reserve_units=None, measured=None):
    try:
        ident, rate = begin_attempt(provider, model, fallback, reserve_units or {})
    except SQLAlchemyError as exc:
        raise UsageBlocked("AI is temporarily unavailable while usage tracking recovers. Please try again later.", 503) from exc
    started = perf_counter()
    result = None
    failure = None
    try:
        result = call()
        return result
    except Exception as exc:
        failure = type(exc).__name__
        raise
    finally:
        if ident:
            try:
                units = measured(result) if result is not None and measured else {}
            except Exception:
                units = {}
            amount = cost(rate, **units) if result is not None else None
            values = dict(status="failure" if failure else "success", duration_ms=int((perf_counter()-started)*1000),
                          error_type=failure, cost_micros=amount, cost_basis=("estimated" if "images" in units or "characters" in units else "calculated") if amount is not None else "unknown",
                          **{key: value for key, value in units.items()
                             if key not in {"input_cache_hit_tokens", "input_cache_miss_tokens", "peak"}})
            try:
                with engine().begin() as conn:
                    conn.execute(update(attempts).where(attempts.c.id == ident).values(**values))
            except SQLAlchemyError:
                # Durable pending row/reservation remains; never silently release uncertain spend.
                log.error("Pulse usage settlement pending: %s", ident)


def chat_call(client, provider, kwargs, fallback=False):
    if not enabled():
        return client.chat.completions.create(**kwargs)
    import json
    try:
        with engine().connect() as conn:
            cfg = read_config(conn)
    except SQLAlchemyError as exc:
        raise UsageBlocked("AI usage tracking is temporarily unavailable.", 503) from exc
    params = dict(kwargs)
    input_bound = len(json.dumps(params.get("messages", []), ensure_ascii=False).encode("utf-8")) + 256
    if input_bound > cfg["max_input_bytes"]:
        raise UsageBlocked("This request is too long. Please shorten it and try again.", 413)
    output_bound = min(int(params.pop("max_completion_tokens", params.pop("max_tokens", cfg["max_output_tokens"]))), cfg["max_output_tokens"])
    params["max_completion_tokens" if provider == "openai" else "max_tokens"] = output_bound
    peak = deepseek_peak() if provider == "deepseek" else False
    def measured(response):
        usage = getattr(response, "usage", None)
        units = {
            "input_tokens": getattr(usage, "prompt_tokens", None),
            "output_tokens": getattr(usage, "completion_tokens", None),
        }
        if provider == "deepseek":
            units.update({
                "input_cache_hit_tokens": getattr(usage, "prompt_cache_hit_tokens", None),
                "input_cache_miss_tokens": getattr(usage, "prompt_cache_miss_tokens", None),
                "peak": peak,
            })
        elif provider == "openai":
            details = getattr(usage, "prompt_tokens_details", None)
            units["input_cache_hit_tokens"] = getattr(details, "cached_tokens", None) if details is not None else None
        return units
    return provider_call(provider, params["model"], lambda: client.with_options(max_retries=0).chat.completions.create(**params),
        fallback=fallback, reserve_units={"input_tokens": input_bound, "output_tokens": output_bound, "peak": peak}, measured=measured)


def dashboard():
    with engine().connect() as conn:
        cfg = read_config(conn)
        periods = {}
        for name, start in windows().items():
            spend = conn.execute(select(
                func.coalesce(func.sum(attempts.c.cost_micros), 0),
                func.count().filter(attempts.c.cost_micros.is_(None)),
                func.coalesce(func.sum(case(
                    (attempts.c.cost_micros.is_(None), attempts.c.reserved_micros),
                    else_=0,
                )), 0),
            ).where(attempts.c.created_at >= start)).one()
            active = conn.execute(select(func.count(func.distinct(requests.c.user_id))).where(
                requests.c.created_at >= start, requests.c.status == "success"
            )).scalar_one()
            periods[name] = {
                "cost_micros": spend[0],
                "unknown_attempts": spend[1],
                "unsettled_micros": spend[2],
                "active_users": active,
                "cost_per_active_user_micros": round(spend[0] / active) if active else None,
            }

        start = windows()["month"]
        request_costs = (
            select(
                attempts.c.request_id.label("request_id"),
                attempts.c.user_id.label("user_id"),
                attempts.c.feature.label("feature"),
                func.coalesce(func.sum(attempts.c.cost_micros), 0).label("known_cost_micros"),
                func.count().filter(attempts.c.cost_micros.is_(None)).label("unknown_attempts"),
            )
            .where(attempts.c.created_at >= start)
            .group_by(attempts.c.request_id, attempts.c.user_id, attempts.c.feature)
            .subquery()
        )

        feature_rows = [
            dict(r) for r in conn.execute(select(
                attempts.c.feature.label("name"),
                func.coalesce(func.sum(attempts.c.cost_micros), 0).label("cost_micros"),
                func.count().label("attempts"),
                func.count(func.distinct(attempts.c.request_id)).label("requests"),
                func.sum(attempts.c.fallback).label("fallbacks"),
                func.count().filter(attempts.c.cost_micros.is_(None)).label("unknown_attempts"),
                func.coalesce(func.sum(case((attempts.c.provider == "openai", attempts.c.cost_micros), else_=0)), 0).label("openai_cost_micros"),
                func.coalesce(func.sum(case((attempts.c.provider == "deepseek", attempts.c.cost_micros), else_=0)), 0).label("deepseek_cost_micros"),
            ).where(attempts.c.created_at >= start)
             .group_by(attempts.c.feature)
             .order_by(func.sum(attempts.c.cost_micros).desc()).limit(50)).mappings()
        ]
        feature_avg = {
            r["feature"]: r for r in conn.execute(select(
                request_costs.c.feature.label("feature"),
                func.count().filter(request_costs.c.unknown_attempts == 0).label("known_requests"),
                func.avg(case((request_costs.c.unknown_attempts == 0, request_costs.c.known_cost_micros), else_=None)).label("average_cost_per_request_micros"),
            ).group_by(request_costs.c.feature)).mappings()
        }
        for row in feature_rows:
            avg = feature_avg.get(row["name"], {})
            row["known_requests"] = avg.get("known_requests", 0)
            row["average_cost_per_request_micros"] = avg.get("average_cost_per_request_micros")

        user_rows = [
            dict(r) for r in conn.execute(select(
                attempts.c.user_id.label("user_id"),
                func.coalesce(func.sum(attempts.c.cost_micros), 0).label("cost_micros"),
                func.count(func.distinct(attempts.c.request_id)).label("requests"),
                func.count().label("attempts"),
                func.count().filter(attempts.c.cost_micros.is_(None)).label("unknown_attempts"),
            ).where(attempts.c.created_at >= start)
             .group_by(attempts.c.user_id)
             .order_by(func.sum(attempts.c.cost_micros).desc()).limit(50)).mappings()
        ]
        user_avg = {
            r["user_id"]: r for r in conn.execute(select(
                request_costs.c.user_id.label("user_id"),
                func.count().filter(request_costs.c.unknown_attempts == 0).label("known_requests"),
                func.avg(case((request_costs.c.unknown_attempts == 0, request_costs.c.known_cost_micros), else_=None)).label("average_cost_per_request_micros"),
            ).group_by(request_costs.c.user_id)).mappings()
        }
        for row in user_rows:
            avg = user_avg.get(row["user_id"], {})
            row["known_requests"] = avg.get("known_requests", 0)
            row["average_cost_per_request_micros"] = avg.get("average_cost_per_request_micros")

        user_features = [
            dict(r) for r in conn.execute(select(
                attempts.c.user_id.label("user_id"),
                attempts.c.feature.label("feature"),
                func.coalesce(func.sum(attempts.c.cost_micros), 0).label("cost_micros"),
                func.count(func.distinct(attempts.c.request_id)).label("requests"),
                func.count().filter(attempts.c.cost_micros.is_(None)).label("unknown_attempts"),
            ).where(attempts.c.created_at >= start)
             .group_by(attempts.c.user_id, attempts.c.feature)
             .order_by(func.sum(attempts.c.cost_micros).desc()).limit(100)).mappings()
        ]

        providers = [
            dict(r) for r in conn.execute(select(
                attempts.c.provider.label("provider"),
                attempts.c.model.label("model"),
                func.coalesce(func.sum(attempts.c.cost_micros), 0).label("cost_micros"),
                func.count().label("attempts"),
                func.count(func.distinct(attempts.c.request_id)).label("requests"),
                func.count().filter(attempts.c.cost_micros.is_(None)).label("unknown_attempts"),
                func.sum(attempts.c.fallback).label("fallbacks"),
            ).where(attempts.c.created_at >= start)
             .group_by(attempts.c.provider, attempts.c.model)
             .order_by(func.sum(attempts.c.cost_micros).desc()).limit(50)).mappings()
        ]

        values = [
            dict(r) for r in conn.execute(select(
                events.c.feature, events.c.event, events.c.source, func.count().label("count")
            ).where(events.c.created_at >= start)
             .group_by(events.c.feature, events.c.event, events.c.source)).mappings()
        ]

        recent_requests = [
            dict(r) for r in conn.execute(
                select(requests).order_by(requests.c.created_at.desc()).limit(100)
            ).mappings()
        ]
        request_ids = [r["id"] for r in recent_requests]
        attempt_rows = []
        if request_ids:
            attempt_rows = [
                dict(r) for r in conn.execute(select(
                    attempts.c.id, attempts.c.request_id, attempts.c.provider, attempts.c.model,
                    attempts.c.status, attempts.c.fallback, attempts.c.cost_micros,
                ).where(attempts.c.request_id.in_(request_ids))
                 .order_by(attempts.c.created_at.asc())).mappings()
            ]
        attempts_by_request = {}
        for attempt in attempt_rows:
            attempts_by_request.setdefault(attempt["request_id"], []).append(attempt)

        recent = []
        for request in recent_requests:
            request_attempts = attempts_by_request.get(request["id"], [])
            unknown = sum(1 for a in request_attempts if a["cost_micros"] is None)
            total = None if unknown or not request_attempts else sum(a["cost_micros"] for a in request_attempts)
            recent.append({
                "id": request["id"],
                "user_id": request["user_id"],
                "feature": request["feature"],
                "status": request["status"],
                "duration_ms": request["duration_ms"],
                "attempts": len(request_attempts),
                "unknown_attempts": unknown,
                "fallback": any(a["fallback"] for a in request_attempts),
                "cost_micros": total,
                "providers": [
                    {
                        "provider": a["provider"],
                        "model": a["model"],
                        "cost_micros": a["cost_micros"],
                        "fallback": bool(a["fallback"]),
                        "status": a["status"],
                    }
                    for a in request_attempts
                ],
            })

        revision = conn.execute(select(policy.c.revision).where(policy.c.id == 1)).scalar_one()

    return {
        "periods": periods,
        "features": feature_rows,
        "providers": providers,
        "users": user_rows,
        "user_features": user_features,
        "value_events": values,
        "recent": recent,
        "config": cfg,
        "revision": revision,
    }
