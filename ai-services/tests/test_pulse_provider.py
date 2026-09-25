"""Exercise the existing OpenAI → compatibility → DeepSeek fallback with accounting."""
from copy import deepcopy
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest
from sqlalchemy import select, update
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.core import config
from shared import pulse_usage as ledger
from scripts.migrate_pulse_usage import migrate


def test_fallback_attempts_and_no_retry_on_budget(tmp_path, monkeypatch):
    monkeypatch.setenv("PULSE_USAGE_ENABLED", "true")
    monkeypatch.setenv("PULSE_DATABASE_URL", "sqlite:///"+(tmp_path/"usage.db").as_posix())
    eng = ledger.engine()
    migrate(eng)
    monkeypatch.setattr(config.settings, "openai_compatibility_model", "compatible")
    monkeypatch.setattr(config.settings, "deepseek_api_key", "test-key")
    monkeypatch.setattr(config.settings, "deepseek_model", "deepseek-test")
    called = []
    class Client:
        def __init__(self, fail):
            self.fail = fail
            self.chat = SimpleNamespace(completions=self)
        def with_options(self, **kwargs):
            assert kwargs["max_retries"] == 0
            return self
        def create(self, **kwargs):
            called.append(kwargs["model"])
            if self.fail:
                raise RuntimeError("simulated provider failure")
            return SimpleNamespace(usage=SimpleNamespace(prompt_tokens=10, completion_tokens=20))
    monkeypatch.setattr(config, "OpenAI", lambda **kwargs: Client(False))
    token = ledger.context.set({"user_id": 1, "request_id": "a"*32, "feature": "assistant"})
    try:
        config.create_chat_completion(Client(True), model="primary", messages=[{"role": "user", "content": "hello"}])
        with eng.connect() as conn:
            rows = conn.execute(select(ledger.attempts).order_by(ledger.attempts.c.created_at)).mappings().all()
        assert called == ["primary", "compatible", "deepseek-test"]
        assert [r["status"] for r in rows] == ["failure", "failure", "success"]
        assert [r["fallback"] for r in rows] == [0, 1, 1]
        cfg = deepcopy(ledger.DEFAULT_CONFIG)
        cfg["mode"] = "enforce"
        with eng.begin() as conn:
            conn.execute(update(ledger.policy).values(config=cfg))
        called.clear()
        with pytest.raises(ledger.UsageBlocked):
            config.create_chat_completion(Client(True), model="primary", messages=[])
        assert called == []
    finally:
        ledger.context.reset(token)
        eng.dispose()
