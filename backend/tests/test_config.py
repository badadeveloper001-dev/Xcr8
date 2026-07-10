import importlib

import pytest


@pytest.mark.usefixtures("monkeypatch")
def test_backend_settings_load_from_backend_env_files(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    import backend.app.core.config as config_module

    reloaded = importlib.reload(config_module)

    assert reloaded.settings.supabase_url == "https://vqaownaeuqttpxzkqyie.supabase.co"
    assert reloaded.settings.supabase_anon_key.startswith("eyJhbGciOi")
    assert reloaded.settings.supabase_service_role_key.startswith("eyJhbGciOi")
