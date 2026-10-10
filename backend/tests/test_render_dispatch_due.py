import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "render_dispatch_due.py"
SPEC = importlib.util.spec_from_file_location("render_dispatch_due", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
scheduler = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scheduler)


def test_scheduler_invokes_both_jobs_even_when_first_fails(monkeypatch):
    monkeypatch.setenv("BACKEND_API_URL", "https://api.example.test/")
    monkeypatch.setenv("CRON_SECRET", "cron-test-secret")
    calls = []

    def fake_invoke(base_url, secret, path, method):
        calls.append((base_url, secret, path, method))
        return 1 if path == "/api/v1/scheduling/dispatch-due" else 0

    monkeypatch.setattr(scheduler, "invoke", fake_invoke)

    result = scheduler.main()

    assert result == 1
    assert calls == [
        ("https://api.example.test", "cron-test-secret", "/api/v1/scheduling/dispatch-due", "GET"),
        ("https://api.example.test", "cron-test-secret", "/api/v1/account/deletion/process-pending", "POST"),
    ]


def test_scheduler_requires_cron_secret(monkeypatch):
    monkeypatch.setenv("BACKEND_API_URL", "https://api.example.test")
    monkeypatch.delenv("CRON_SECRET", raising=False)

    with pytest.raises(RuntimeError, match="CRON_SECRET is required"):
        scheduler.main()


def test_invoke_sends_bearer_auth_and_reports_success(monkeypatch, capsys):
    captured = {}

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"processed":0}'

    def fake_urlopen(request, timeout):
        captured["request"] = request
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(scheduler.urllib.request, "urlopen", fake_urlopen)

    result = scheduler.invoke(
        "https://api.example.test",
        "cron-test-secret",
        "/api/v1/account/deletion/process-pending",
        "POST",
    )

    assert result == 0
    assert captured["request"].get_header("Authorization") == "Bearer cron-test-secret"
    assert captured["request"].get_method() == "POST"
    assert captured["timeout"] == 50
    assert '"status": 200' in capsys.readouterr().out
