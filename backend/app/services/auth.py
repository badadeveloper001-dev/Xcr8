from __future__ import annotations

from supabase import Client, create_client

from app.core.config import settings


def get_supabase_admin_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
