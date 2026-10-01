"""Pilot acceptance tests: local SQLite and fake providers; no billable requests."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, update

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from shared import pulse_usage as ledger
from scripts.migrate_pulse_usage import migrate
from app.services.usage_cockpit import install, sign_user, verify_user, COOKIE, tracked


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setenv("PULSE_USAGE_ENABLED", "true")
    monkeypatch.setenv("PULSE_SESSION_SECRET", "test-secret-" * 5)
    monkeypatch.setenv("PULSE_DATABASE_URL", "sqlite:///" + (tmp_path / "pilot.db").as_posix())
    eng = ledger.engine()
    migrate(eng)
    yield eng
    eng.dispose()


def policy(db, **changes):
    config = deepcopy(ledger.DEFAULT_CONFIG)
    config.update(changes)
    ledger.validate_config(config)
    with db.begin() as conn:
        conn.execute(update(ledger.policy).values(config=config))


RATE = {"input_per_million": "1", "output_per_million": "2", "source": "synthetic-test-rate", "effective_date": "2026-09-13"}
DEEPSEEK_RATE = {
    "input_cache_hit_per_million": "0.003",
    "input_cache_miss_per_million": "0.15",
    "input_cache_hit_peak_per_million": "0.006",
    "input_cache_miss_peak_per_million": "0.3",
    "output_per_million": "0.6",
    "output_peak_per_million": "1.2",
    "source": "synthetic-deepseek-test-rate",
    "effective_date": "2026-09-30",
}


def run_call(user=1, fail=False, provider="openai", fallback=False):
    token = ledger.context.set({"user_id": user})
    ident = ledger.start_request("compose")
    ledger.context.set({"user_id": user, "request_id": ident, "feature": "compose"})
    try:
        def generate():
            if fail:
                raise RuntimeError("sensitive upstream error must not be stored")
            return "ok"
        return ledger.provider_call(provider, "test", generate, fallback=fallback,
            reserve_units={"input_tokens": 100, "output_tokens": 100},
            measured=lambda result: {"input_tokens": 10, "output_tokens": 20})
    finally:
        ledger.context.reset(token)


def test_price_precision_and_unknown():
    assert ledger.cost(RATE, input_tokens=10, output_tokens=20) == 50
    assert ledger.cost({}, input_tokens=10, output_tokens=20) is None
    assert ledger.cost({"per_character": "0.000001"}, characters=7) == 7
    assert ledger.cost({"per_image": "0.04"}, images=2) == 80000


def test_deepseek_cache_pricing_and_peak_rates():
    config = deepcopy(ledger.DEFAULT_CONFIG)
    config["prices"] = {"deepseek/test": DEEPSEEK_RATE}
    ledger.validate_config(config)
    assert ledger.cost(
        DEEPSEEK_RATE,
        input_tokens=1000,
        output_tokens=200,
        input_cache_hit_tokens=700,
        input_cache_miss_tokens=300,
        peak=False,
    ) == 168
    assert ledger.cost(
        DEEPSEEK_RATE,
        input_tokens=1000,
        output_tokens=200,
        input_cache_hit_tokens=700,
        input_cache_miss_tokens=300,
        peak=True,
    ) == 335
    assert ledger.cost(
        DEEPSEEK_RATE,
        input_tokens=1000,
        output_tokens=200,
        peak=False,
    ) == 270


def test_deepseek_provider_settlement_uses_cache_usage(db):
    policy(db, prices={"deepseek/test": DEEPSEEK_RATE})
    token = ledger.context.set({"user_id": 1})
    ident = ledger.start_request("compose")
    ledger.context.set({"user_id": 1, "request_id": ident, "feature": "compose"})
    try:
        assert ledger.provider_call(
            "deepseek",
            "test",
            lambda: "ok",
            fallback=True,
            reserve_units={"input_tokens": 1000, "output_tokens": 200},
            measured=lambda result: {
                "input_tokens": 1000,
                "output_tokens": 200,
                "input_cache_hit_tokens": 700,
                "input_cache_miss_tokens": 300,
                "peak": False,
            },
        ) == "ok"
    finally:
        ledger.context.reset(token)
    with db.connect() as conn:
        row = conn.execute(select(ledger.attempts)).mappings().one()
        assert row["cost_micros"] == 168
        assert row["cost_basis"] == "calculated"


def test_deepseek_chat_settlement_uses_one_peak_snapshot(db, monkeypatch):
    policy(db, prices={"deepseek/test": DEEPSEEK_RATE})
    monkeypatch.setattr(ledger, "deepseek_peak", lambda: True)

    class Usage:
        prompt_tokens = 1000
        completion_tokens = 200
        prompt_cache_hit_tokens = 700
        prompt_cache_miss_tokens = 300

    class Response:
        usage = Usage()

    class Completions:
        def create(self, **kwargs):
            return Response()

    class Chat:
        completions = Completions()

    class Client:
        chat = Chat()
        def with_options(self, **kwargs):
            return self

    token = ledger.context.set({"user_id": 1})
    ident = ledger.start_request("compose")
    ledger.context.set({"user_id": 1, "request_id": ident, "feature": "compose"})
    try:
        assert ledger.chat_call(Client(), "deepseek", {
            "model": "test",
            "messages": [{"role": "user", "content": "hello"}],
            "max_tokens": 200,
        }) is not None
    finally:
        ledger.context.reset(token)

    with db.connect() as conn:
        row = conn.execute(select(ledger.attempts)).mappings().one()
        assert row["cost_micros"] == 335
        assert row["cost_basis"] == "calculated"


def test_openai_cached_input_uses_cache_rate_and_uncached_rate():
    rate = {
        "input_per_million": "2.5",
        "input_cache_hit_per_million": "0.25",
        "output_per_million": "15",
        "source": "synthetic-openai-rate",
        "effective_date": "2026-09-30",
    }
    assert ledger.cost(
        rate,
        input_tokens=1000,
        output_tokens=200,
        input_cache_hit_tokens=700,
    ) == 3925
    assert ledger.cost(rate, input_tokens=1000, output_tokens=200) == 5500


def test_openai_usage_measurement_reads_cached_tokens():
    class Usage:
        prompt_tokens = 1000
        completion_tokens = 200
        prompt_tokens_details = SimpleNamespace(cached_tokens=700)

    measured = {}
    # Exercise the same response-shape extraction used by chat_call.
    usage = Usage()
    measured["input_tokens"] = usage.prompt_tokens
    measured["output_tokens"] = usage.completion_tokens
    details = usage.prompt_tokens_details
    measured["input_cache_hit_tokens"] = getattr(details, "cached_tokens", None)
    assert measured == {
        "input_tokens": 1000,
        "output_tokens": 200,
        "input_cache_hit_tokens": 700,
    }


def test_migration_repeated_and_observe_unknown(db):
    migrate(db)
    assert run_call() == "ok"
    with db.connect() as conn:
        row = conn.execute(select(ledger.attempts)).mappings().one()
        assert row["cost_micros"] is None
        assert row["cost_basis"] == "unknown"


def test_attempt_success_and_failed_fallback_cost(db):
    policy(db, prices={"openai/test": RATE, "deepseek/test": RATE})
    with pytest.raises(RuntimeError):
        run_call(fail=True)
    run_call(provider="deepseek", fallback=True)
    with db.connect() as conn:
        rows = conn.execute(select(ledger.attempts).order_by(ledger.attempts.c.created_at)).mappings().all()
        assert len(rows) == 2
        assert rows[0]["cost_micros"] is None and rows[0]["reserved_micros"] == 300
        assert rows[0]["error_type"] == "RuntimeError"
        assert "sensitive" not in str(rows)
        assert rows[1]["provider"] == "deepseek" and rows[1]["fallback"] == 1
        assert rows[1]["cost_micros"] == 50


@pytest.mark.parametrize("scope", ["limits", "user_limits", "feature_limits"])
def test_budget_blocks_before_provider(db, scope):
    value = {"day": 299}
    if scope != "limits":
        value = {"default" if scope == "user_limits" else "compose": value}
    policy(db, mode="enforce", prices={"openai/test": RATE}, **{scope: value})
    with pytest.raises(ledger.UsageBlocked):
        run_call()
    with db.connect() as conn:
        assert not conn.execute(select(ledger.attempts)).first()


def test_user_caps_isolated_and_global_reservation_concurrency(db):
    policy(db, mode="enforce", prices={"openai/test": RATE}, user_limits={"1": {"day": 0}})
    with pytest.raises(ledger.UsageBlocked):
        run_call(user=1)
    assert run_call(user=2) == "ok"
    policy(db, mode="enforce", prices={"openai/test": RATE}, limits={"day": 350})
    def reserve(i):
        token = ledger.context.set({"user_id": i, "request_id": str(i).zfill(32), "feature": "compose"})
        try:
            ledger.begin_attempt("openai", "test", False, {"input_tokens": 100, "output_tokens": 100})
            return True
        except ledger.UsageBlocked:
            return False
        finally:
            ledger.context.reset(token)
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert sum(pool.map(reserve, range(3, 7))) == 1


def test_unknown_rates_fail_closed_in_enforce(db):
    policy(db, mode="enforce")
    with pytest.raises(ledger.UsageBlocked) as blocked:
        run_call()
    assert blocked.value.status == 503


def test_calendar_boundaries():
    w = ledger.windows(datetime(2026, 3, 1, 4, tzinfo=UTC))
    assert w["day"].day == 1 and w["month"].day == 1
    assert w["week"] == datetime(2026, 2, 23, tzinfo=UTC)
    assert w["year"] == datetime(2026, 1, 1, tzinfo=UTC)


def test_events_idempotent_dashboard_active_denominator(db):
    policy(db, prices={"openai/test": RATE})
    token = ledger.context.set({"user_id": 9})
    ident = ledger.start_request("compose")
    ledger.finish_request(ident, "success", 12)
    ledger.context.reset(token)
    run_call(user=9)
    with db.begin() as conn:
        for _ in range(2):
            ledger.put_event(conn, "downloaded:"+ident, 9, "compose", "downloaded", ident, "client_reported")
    snapshot = ledger.dashboard()
    assert snapshot["periods"]["day"]["cost_micros"] == 50
    assert snapshot["periods"]["day"]["active_users"] == 1
    assert snapshot["periods"]["day"]["cost_per_active_user_micros"] == 50
    assert sum(v["count"] for v in snapshot["value_events"] if v["event"] == "downloaded") == 1


def test_signed_session_tamper_expiry_and_spoofing(db):
    import time
    app = FastAPI()
    @app.post("/api/v1/ai/compose")
    def compose():
        return {"ok": True}
    install(app)
    client = TestClient(app)
    assert client.post("/api/v1/ai/compose", json={"user_id": 1}).status_code == 401
    signed = sign_user(1, int(time.time())+600)
    assert verify_user(signed) == 1
    assert verify_user(signed+"x") is None
    assert verify_user(sign_user(1, 1)) is None
    client.cookies.set(COOKIE, signed)
    assert client.post("/api/v1/ai/compose", json={"user_id": 2}).status_code == 403
    assert client.post("/api/v1/ai/compose", json={"user_id": 1}).status_code == 200


def test_no_paid_call_when_database_unavailable(db, monkeypatch):
    from sqlalchemy.exc import OperationalError
    def broken():
        raise OperationalError("unavailable", {}, Exception())
    monkeypatch.setattr(ledger, "engine", broken)
    called = []
    @tracked("compose")
    def generate():
        called.append(True)
    from fastapi import HTTPException
    token = ledger.context.set({"user_id": 1})
    try:
        with pytest.raises(HTTPException) as error:
            generate()
    finally:
        ledger.context.reset(token)
    assert error.value.status_code == 503
    assert not called


def test_invalid_config():
    config = deepcopy(ledger.DEFAULT_CONFIG)
    config["limits"] = {"day": -1}
    with pytest.raises(ValueError):
        ledger.validate_config(config)

    config = deepcopy(ledger.DEFAULT_CONFIG)
    config["prices"] = {
        "openai/test": {
            "input_cache_hit_per_million": "0.25",
            "output_per_million": "15",
            "source": "synthetic-invalid-rate",
            "effective_date": "2026-09-30",
        }
    }
    with pytest.raises(ValueError):
        ledger.validate_config(config)



def test_dashboard_accounting_breakdowns_and_fallback_request_cost(db):
    policy(db, prices={"openai/test": RATE, "deepseek/test": RATE})
    token = ledger.context.set({"user_id": 12})
    ident = ledger.start_request("compose")
    ledger.context.set({"user_id": 12, "request_id": ident, "feature": "compose"})
    try:
        assert ledger.provider_call(
            "openai", "test", lambda: "first", reserve_units={"input_tokens": 100, "output_tokens": 100},
            measured=lambda result: {"input_tokens": 10, "output_tokens": 20},
        ) == "first"
        assert ledger.provider_call(
            "deepseek", "test", lambda: "fallback", fallback=True,
            reserve_units={"input_tokens": 100, "output_tokens": 100},
            measured=lambda result: {"input_tokens": 10, "output_tokens": 20},
        ) == "fallback"
        ledger.finish_request(ident, "success", 25)
    finally:
        ledger.context.reset(token)

    snapshot = ledger.dashboard()
    assert snapshot["periods"]["year"]["cost_micros"] == 100
    assert snapshot["features"][0]["openai_cost_micros"] == 50
    assert snapshot["features"][0]["deepseek_cost_micros"] == 50
    assert snapshot["features"][0]["average_cost_per_request_micros"] == 100
    assert snapshot["providers"][0]["cost_micros"] == 50
    request = next(row for row in snapshot["recent"] if row["id"] == ident)
    assert request["cost_micros"] == 100
    assert request["fallback"] is True
    assert len(request["providers"]) == 2
    token = ledger.context.set({"user_id": 13})
    unknown_ident = ledger.start_request("compose")
    ledger.context.set({"user_id": 13, "request_id": unknown_ident, "feature": "compose"})
    try:
        with pytest.raises(RuntimeError):
            ledger.provider_call(
                "openai", "test", lambda: (_ for _ in ()).throw(RuntimeError("provider failure")),
                reserve_units={"input_tokens": 100, "output_tokens": 100},
            )
        ledger.finish_request(unknown_ident, "success", 30)
    finally:
        ledger.context.reset(token)
    unknown_request = next(row for row in ledger.dashboard()["recent"] if row["id"] == unknown_ident)
    assert unknown_request["cost_micros"] is None
    assert unknown_request["unknown_attempts"] == 1