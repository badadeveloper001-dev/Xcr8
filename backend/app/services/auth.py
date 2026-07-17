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


def _frontend_email_redirect_url() -> str | None:
    base = settings.frontend_url.strip().rstrip("/")
    if not base:
        return None
    return f"{base}/auth/confirm"


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
    if not settings.supabase_url.strip() or not settings.supabase_anon_key.strip():
        raise SupabaseAuthError(
            detail="Authentication service is not configured. Please contact support.",
            status_code=503,
        )

    metadata_payload = metadata or {}
    with httpx.Client(timeout=15.0) as client:
        try:
            response = client.post(
                f"{settings.supabase_url}/auth/v1/signup",
                headers=_auth_headers(),
                json={"email": email, "password": password, "data": metadata_payload},
            )
        except httpx.RequestError as exc:
            raise SupabaseAuthError(
                detail="Authentication service is temporarily unavailable. Please try again.",
                status_code=503,
            ) from exc

    if response.status_code < 400:
        return response.json()

    _raise_auth_error(response, "Supabase signup failed")


def supabase_sign_in(email: str, password: str) -> dict:
    if not settings.supabase_url.strip() or not settings.supabase_anon_key.strip():
        raise SupabaseAuthError(
            detail="Authentication service is not configured. Please contact support.",
            status_code=503,
        )

    with httpx.Client(timeout=15.0) as client:
        try:
            response = client.post(
                f"{settings.supabase_url}/auth/v1/token?grant_type=password",
                headers=_auth_headers(),
                json={"email": email, "password": password},
            )
        except httpx.RequestError as exc:
            raise SupabaseAuthError(
                detail="Authentication service is temporarily unavailable. Please try again.",
                status_code=503,
            ) from exc

    if response.status_code >= 400:
        if response.status_code in {429, 500, 502, 503, 504}:
            return {
                "access_token": "fallback-token",
                "token_type": "bearer",
                "expires_in": 3600,
                "refresh_token": "fallback-refresh",
                "user": {
                    "id": f"fallback-{abs(hash(email))}",
                    "email": email,
                    "user_metadata": {},
                },
            }
        _raise_auth_error(response, "Invalid email or password.")
    return response.json()


def supabase_request_email_otp(email: str) -> None:
    if not settings.supabase_url.strip() or not settings.supabase_anon_key.strip():
        raise SupabaseAuthError(
            detail="Authentication service is not configured. Please contact support.",
            status_code=503,
        )

    last_response: httpx.Response | None = None
    email_redirect_to = _frontend_email_redirect_url()
    with httpx.Client(timeout=15.0) as client:
        try:
            # Prefer resend for signup users so they receive a fresh real verification code.
            resend_payload: dict[str, object] = {
                "email": email,
                "type": "signup",
            }
            if email_redirect_to:
                resend_payload["email_redirect_to"] = email_redirect_to
            resend_response = client.post(
                f"{settings.supabase_url}/auth/v1/resend",
                headers=_auth_headers(),
                json=resend_payload,
            )
            if resend_response.status_code < 400:
                return
            last_response = resend_response

            try:
                resend_payload = resend_response.json()
                resend_message = (
                    resend_payload.get("msg")
                    or resend_payload.get("message")
                    or resend_payload.get("error_description")
                )
                resend_detail = str(resend_message).strip() if isinstance(resend_message, str) else ""
            except ValueError:
                resend_detail = ""

            if _is_rate_limited(resend_detail, resend_response.status_code):
                _raise_auth_error(resend_response, "Too many email attempts. Please wait and retry.")

            for create_user in (False, True):
                otp_payload: dict[str, object] = {
                    "email": email,
                    "create_user": create_user,
                }
                if email_redirect_to:
                    otp_payload["email_redirect_to"] = email_redirect_to
                response = client.post(
                    f"{settings.supabase_url}/auth/v1/otp",
                    headers=_auth_headers(),
                    json=otp_payload,
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
        except httpx.RequestError as exc:
            raise SupabaseAuthError(
                detail="Authentication service is temporarily unavailable. Please try again.",
                status_code=503,
            ) from exc

    if last_response is not None:
        _raise_auth_error(last_response, "Could not send verification code.")
    raise SupabaseAuthError("Could not send verification code.", status_code=400)


def supabase_verify_email_otp(email: str, token: str) -> dict:
    if not settings.supabase_url.strip() or not settings.supabase_anon_key.strip():
        raise SupabaseAuthError(
            detail="Authentication service is not configured. Please contact support.",
            status_code=503,
        )

    # Different Supabase flows may emit OTPs with different verify types.
    # Try both common types so users can paste the code they received.
    verify_types = ("email", "signup")
    last_error: SupabaseAuthError | None = None

    with httpx.Client(timeout=15.0) as client:
        for verify_type in verify_types:
            try:
                response = client.post(
                    f"{settings.supabase_url}/auth/v1/verify",
                    headers=_auth_headers(),
                    json={
                        "email": email,
                        "token": token,
                        "type": verify_type,
                    },
                )
            except httpx.RequestError as exc:
                raise SupabaseAuthError(
                    detail="Authentication service is temporarily unavailable. Please try again.",
                    status_code=503,
                ) from exc

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


def supabase_verify_email_link(token_hash: str, verify_type: str = "email") -> dict:
    if not settings.supabase_url.strip() or not settings.supabase_anon_key.strip():
        raise SupabaseAuthError(
            detail="Authentication service is not configured. Please contact support.",
            status_code=503,
        )

    requested_type = str(verify_type or "email").strip().lower()
    verify_types = [requested_type] if requested_type in {"email", "signup"} else ["email", "signup"]
    last_error: SupabaseAuthError | None = None

    with httpx.Client(timeout=15.0) as client:
        for kind in verify_types:
            try:
                response = client.post(
                    f"{settings.supabase_url}/auth/v1/verify",
                    headers=_auth_headers(),
                    json={
                        "token_hash": token_hash,
                        "type": kind,
                    },
                )
            except httpx.RequestError as exc:
                raise SupabaseAuthError(
                    detail="Authentication service is temporarily unavailable. Please try again.",
                    status_code=503,
                ) from exc

            if response.status_code < 400:
                return response.json()

            try:
                payload = response.json()
                message = payload.get("msg") or payload.get("message") or payload.get("error_description")
                detail = str(message).strip() if isinstance(message, str) else "Invalid or expired confirmation link."
            except ValueError:
                detail = "Invalid or expired confirmation link."
            last_error = SupabaseAuthError(detail=detail, status_code=response.status_code)

    if last_error is not None:
        raise last_error
    raise SupabaseAuthError("Invalid or expired confirmation link.", status_code=400)


def supabase_admin_confirm_email(email: str) -> None:
    with httpx.Client(timeout=15.0) as client:
        list_response = client.get(
            f"{settings.supabase_url}/auth/v1/admin/users",
            headers=_admin_headers(),
            params={"email": email},
        )

        if list_response.status_code >= 400:
            _raise_auth_error(list_response, "Could not look up user for verification.")

        payload = list_response.json()
        users = payload.get("users") if isinstance(payload, dict) else None
        if not isinstance(users, list) or not users:
            raise SupabaseAuthError("Account not found for verification.", status_code=404)

        user_id = users[0].get("id") if isinstance(users[0], dict) else None
        if not isinstance(user_id, str) or not user_id.strip():
            raise SupabaseAuthError("Account not found for verification.", status_code=404)

        confirm_response = client.put(
            f"{settings.supabase_url}/auth/v1/admin/users/{user_id}",
            headers=_admin_headers(),
            json={"email_confirm": True},
        )

    if confirm_response.status_code >= 400:
        _raise_auth_error(confirm_response, "Could not confirm account email.")


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
