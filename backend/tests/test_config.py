import importlib

import pytest


@pytest.mark.usefixtures("monkeypatch")
def test_backend_settings_load_from_backend_env_files(monkeypatch, tmp_path):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.chdir(tmp_path)
    (tmp_path / "backend").mkdir()
    (tmp_path / "backend" / ".env").write_text(
        "SUPABASE_URL=https://example.supabase.co\n"
        "SUPABASE_ANON_KEY=test-anon\n"
        "SUPABASE_SERVICE_ROLE_KEY=test-service\n", encoding="utf-8"
    )

    import backend.app.core.config as config_module

    reloaded = importlib.reload(config_module)

    assert reloaded.settings.supabase_url == "https://example.supabase.co"
    assert reloaded.settings.supabase_anon_key == "test-anon"
    assert reloaded.settings.supabase_service_role_key == "test-service"
