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


def _admin_headers() -> dict[str, str]:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }


def _is_rate_limited(message: str, status_code: int) -> bool:
    lowered = message.lower()
    return status_code == 429 or "rate limit" in lowered or "too many" in lowered


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
    metadata_payload = metadata or {}
    with httpx.Client(timeout=15.0) as client:
        response = client.post(
            f"{settings.supabase_url}/auth/v1/signup",
            headers=_auth_headers(),
            json={"email": email, "password": password, "data": metadata_payload},
        )

        if response.status_code < 400:
            return response.json()

        fallback_message = "Supabase signup failed"
        try:
            payload = response.json()
            message = payload.get("msg") or payload.get("message") or payload.get("error_description")
            if isinstance(message, str) and message.strip():
                fallback_message = message
        except ValueError:
            pass

    _raise_auth_error(response, "Supabase signup failed")


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


def supabase_request_email_otp(email: str) -> None:
    last_response: httpx.Response | None = None
    with httpx.Client(timeout=15.0) as client:
        for create_user in (False, True):
            response = client.post(
                f"{settings.supabase_url}/auth/v1/otp",
                headers=_auth_headers(),
                json={
                    "email": email,
                    "create_user": create_user,
                },
            )

            if response.status_code < 400:
                return

            last_response = response
            try:
                payload = response.json()
                message = payload.get("msg") or payload.get("message") or payload.get("error_description")
                detail = str(message).strip() if isinstance(message, str) else ""
            except ValueError:
                detail = ""

            if _is_rate_limited(detail, response.status_code):
                _raise_auth_error(response, "Too many email attempts. Please wait and retry.")

            if create_user is False:
                lowered = detail.lower()
                if (
                    "not found" in lowered
                    or "no user" in lowered
                    or "sign up" in lowered
                    or response.status_code == 422
                ):
                    continue

            _raise_auth_error(response, "Could not send verification code.")

    if last_response is not None:
        _raise_auth_error(last_response, "Could not send verification code.")
    raise SupabaseAuthError("Could not send verification code.", status_code=400)


def supabase_verify_email_otp(email: str, token: str) -> dict:
    # Different Supabase flows may emit OTPs with different verify types.
    # Try both common types so users can paste the code they received.
    verify_types = ("email", "signup")
    last_error: SupabaseAuthError | None = None

    with httpx.Client(timeout=15.0) as client:
        for verify_type in verify_types:
            response = client.post(
                f"{settings.supabase_url}/auth/v1/verify",
                headers=_auth_headers(),
                json={
                    "email": email,
                    "token": token,
                    "type": verify_type,
                },
            )

            if response.status_code < 400:
                return response.json()

            try:
                payload = response.json()
                message = payload.get("msg") or payload.get("message") or payload.get("error_description")
                detail = str(message).strip() if isinstance(message, str) else "Invalid or expired verification code."
            except ValueError:
                detail = "Invalid or expired verification code."
            last_error = SupabaseAuthError(detail=detail, status_code=response.status_code)

    if last_error is not None:
        raise last_error
    raise SupabaseAuthError("Invalid or expired verification code.", status_code=400)


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
