from __future__ import annotations

import httpx

from supabase import Client, create_client

from app.core.config import settings


class SupabaseAuthError(ValueError):
    def __init__(self, detail: str, status_code: int):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def get_supabase_admin_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _auth_headers() -> dict[str, str]:
    return {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {settings.supabase_anon_key}",
        "Content-Type": "application/json",
    }


def _raise_auth_error(response: httpx.Response, fallback: str) -> None:
    detail = fallback
    try:
        payload = response.json()
        message = payload.get("msg") or payload.get("message") or payload.get("error_description")
        if isinstance(message, str) and message.strip():
            detail = message
    except ValueError:
        pass
    raise SupabaseAuthError(detail=detail, status_code=response.status_code)


def supabase_sign_up(email: str, password: str, metadata: dict | None = None) -> dict:
    with httpx.Client(timeout=15.0) as client:
        response = client.post(
            f"{settings.supabase_url}/auth/v1/signup",
            headers=_auth_headers(),
            json={"email": email, "password": password, "data": metadata or {}},
        )

    if response.status_code >= 400:
        _raise_auth_error(response, "Supabase signup failed")
    return response.json()


def supabase_sign_in(email: str, password: str) -> dict:
    with httpx.Client(timeout=15.0) as client:
        response = client.post(
            f"{settings.supabase_url}/auth/v1/token?grant_type=password",
            headers=_auth_headers(),
            json={"email": email, "password": password},
        )

    if response.status_code >= 400:
        _raise_auth_error(response, "Invalid email or password.")
    return response.json()


def supabase_request_password_reset(email: str) -> None:
    with httpx.Client(timeout=15.0) as client:
        response = client.post(
            f"{settings.supabase_url}/auth/v1/recover",
            headers=_auth_headers(),
            json={"email": email},
        )

    if response.status_code >= 400:
        _raise_auth_error(response, "Could not request password reset")


def supabase_update_password(access_token: str, new_password: str) -> None:
    with httpx.Client(timeout=15.0) as client:
        response = client.put(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "apikey": settings.supabase_anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"password": new_password},
        )

    if response.status_code >= 400:
        _raise_auth_error(response, "Invalid or expired reset token.")
