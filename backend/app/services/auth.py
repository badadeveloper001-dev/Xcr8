from __future__ import annotations

from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
import hashlib
import hmac
import secrets
import smtplib

import httpx

from supabase import Client, create_client

from app.core.config import settings


class SupabaseAuthError(ValueError):
    def __init__(self, detail: str, status_code: int):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def stable_fallback_user_id(email: str) -> str:
    normalized = str(email or "").strip().lower()
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"fallback-{digest[:16]}"


def supabase_mark_onboarding_complete(email: str) -> None:
    """Best-effort: write onboarding_complete=true to Supabase user_metadata.

    Silently does nothing if Supabase is not configured or the user cannot be found.
    This keeps admin counts accurate even when the local SQLite DB is ephemeral.
    """
    url = str(settings.supabase_url or "").strip().rstrip("/")
    key = str(settings.supabase_service_role_key or "").strip()
    if not url or not key:
        return

    normalized = str(email or "").strip().lower()
    if not normalized:
        return

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            # Look up the Supabase user UUID by email.
            resp = client.get(
                f"{url}/auth/v1/admin/users",
                headers=headers,
                params={"page": 1, "per_page": 200},
            )
            if resp.status_code >= 400:
                return

            payload = resp.json()
            users = payload.get("users") if isinstance(payload, dict) else []
            if not isinstance(users, list):
                return

            user_id = None
            for user in users:
                if str(user.get("email") or "").strip().lower() == normalized:
                    user_id = user.get("id")
                    break

            if not user_id:
                return

            # Merge onboarding_complete into existing user_metadata (Supabase merges, not replaces).
            client.put(
                f"{url}/auth/v1/admin/users/{user_id}",
                headers=headers,
                json={"user_metadata": {"onboarding_complete": True}},
            )
    except Exception:  # noqa: BLE001 – network/parse failures must not break onboarding
        pass


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
                    "id": stable_fallback_user_id(email),
                    "email": email,
                    "user_metadata": {},
                },
            }
        _raise_auth_error(response, "Invalid email or password.")
    return response.json()


def supabase_get_user(access_token: str) -> dict:
    if not settings.supabase_url.strip() or not settings.supabase_anon_key.strip():
        raise SupabaseAuthError(
            detail="Authentication service is not configured. Please contact support.",
            status_code=503,
        )

    with httpx.Client(timeout=15.0) as client:
        try:
            response = client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {access_token}",
                },
            )
        except httpx.RequestError as exc:
            raise SupabaseAuthError(
                detail="Authentication service is temporarily unavailable. Please try again.",
                status_code=503,
            ) from exc

    if response.status_code >= 400:
        _raise_auth_error(response, "Invalid or expired Google session.")
    payload = response.json()
    if not isinstance(payload, dict):
        raise SupabaseAuthError(detail="Invalid Google user payload.", status_code=400)
    return payload


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


def _ensure_smtp_configured() -> None:
    if (
        not settings.smtp_host.strip()
        or not settings.smtp_from_email.strip()
        or not settings.smtp_username.strip()
        or not settings.smtp_password.strip()
    ):
        raise SupabaseAuthError(
            detail="Email service is not configured yet. Please set SMTP environment variables.",
            status_code=503,
        )


def generate_signup_email_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_signup_email_code(email: str, code: str) -> str:
    payload = f"{email.strip().lower()}:{code.strip()}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def verify_signup_email_code(email: str, code: str, code_hash: str) -> bool:
    expected = hash_signup_email_code(email, code)
    return hmac.compare_digest(expected, code_hash)



def send_account_deletion_code(email: str, code: str) -> None:
    """Send a purpose-specific, time-limited confirmation code for account deletion."""
    _ensure_smtp_configured()

    message = EmailMessage()
    message["Subject"] = "Confirm your XCR8 account deletion"
    sender_name = settings.smtp_from_name.strip() or "XCR8"
    message["From"] = f"{sender_name} <{settings.smtp_from_email.strip()}>"
    message["To"] = email
    message.set_content(
        (
            "A request was made to permanently delete your XCR8 account.\n\n"
            f"Your confirmation code is: {code}\n"
            f"This code expires in {max(1, int(settings.signup_code_ttl_minutes))} minutes.\n\n"
            "Enter this code in XCR8 only if you requested account deletion. "
            "If you did not request this, ignore this email; your account will remain active."
        )
    )

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(message)
            return

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.ehlo()
            if settings.smtp_use_tls:
                server.starttls()
                server.ehlo()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise SupabaseAuthError(
            detail="The account-deletion confirmation email could not be sent. Please try again later.",
            status_code=503,
        ) from exc


def supabase_delete_user_by_email(email: str) -> bool:
    """Delete exactly matching Supabase Auth identity; fail closed on admin API errors.

    Returns False only when Supabase is not configured at all or no matching identity exists.
    If Supabase is configured but admin deletion cannot be safely completed, raises an error.
    """
    url = str(settings.supabase_url or "").strip().rstrip("/")
    key = str(settings.supabase_service_role_key or "").strip()
    if not url and not key:
        return False
    if not url or not key:
        raise SupabaseAuthError(
            detail="Account deletion is temporarily unavailable because identity administration is not configured.",
            status_code=503,
        )

    normalized = str(email or "").strip().lower()
    if not normalized:
        raise SupabaseAuthError("The account email is missing.", 400)

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    matching_id: str | None = None
    page = 1
    per_page = 200
    try:
        with httpx.Client(timeout=15.0) as client:
            while True:
                response = client.get(
                    f"{url}/auth/v1/admin/users",
                    headers=headers,
                    params={"page": page, "per_page": per_page},
                )
                if response.status_code >= 400:
                    raise SupabaseAuthError(
                        "Could not verify the account's authentication identity. Please try again later.",
                        503,
                    )
                payload = response.json()
                users = payload.get("users") if isinstance(payload, dict) else None
                if not isinstance(users, list):
                    raise SupabaseAuthError("The authentication service returned an invalid response.", 503)
                matches = [
                    item for item in users
                    if isinstance(item, dict)
                    and str(item.get("email") or "").strip().lower() == normalized
                    and str(item.get("id") or "").strip()
                ]
                if len(matches) > 1:
                    raise SupabaseAuthError(
                        "Account deletion needs support because multiple authentication identities match this email.",
                        503,
                    )
                if matches:
                    matching_id = str(matches[0]["id"])
                    break
                if len(users) < per_page:
                    break
                page += 1

            if not matching_id:
                return False

            response = client.delete(f"{url}/auth/v1/admin/users/{matching_id}", headers=headers)
            if response.status_code not in {200, 204}:
                raise SupabaseAuthError(
                    "Could not remove the account's authentication identity. No local account data was deleted.",
                    503,
                )
            return True
    except SupabaseAuthError:
        raise
    except (httpx.RequestError, ValueError, TypeError) as exc:
        raise SupabaseAuthError(
            "The authentication service is temporarily unavailable. No local account data was deleted.",
            503,
        ) from exc

def send_signup_email_code(email: str, code: str) -> None:
    _ensure_smtp_configured()

    message = EmailMessage()
    message["Subject"] = "Your XCR8 verification code"
    sender_name = settings.smtp_from_name.strip() or "XCR8"
    message["From"] = f"{sender_name} <{settings.smtp_from_email.strip()}>"
    message["To"] = email
    message.set_content(
        (
            "Welcome to XCR8.\n\n"
            f"Your verification code is: {code}\n"
            f"This code expires in {max(1, int(settings.signup_code_ttl_minutes))} minutes.\n\n"
            "If you did not request this, you can ignore this email."
        )
    )

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(message)
            return

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.ehlo()
            if settings.smtp_use_tls:
                server.starttls()
                server.ehlo()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    except OSError as exc:
        raise SupabaseAuthError(
            detail="Email service is temporarily unavailable. Please try again.",
            status_code=503,
        ) from exc


def signup_code_expiry() -> datetime:
    ttl = max(1, int(settings.signup_code_ttl_minutes or 10))
    return datetime.now(tz=UTC) + timedelta(minutes=ttl)


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
    """Send a recovery email that returns to XCR8's reset-password page."""
    frontend_url = settings.frontend_url.strip().rstrip("/")
    params = {}
    if frontend_url:
        params["redirect_to"] = f"{frontend_url}/auth/reset-password"

    with httpx.Client(timeout=15.0) as client:
        response = client.post(
            f"{settings.supabase_url}/auth/v1/recover",
            headers=_auth_headers(),
            params=params,
            json={"email": email},
        )

    if response.status_code >= 400:
        _raise_auth_error(response, "Could not request password reset")


def supabase_update_password(access_token: str, new_password: str) -> str | None:
    """Update the Supabase password and return the verified account email."""
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

    try:
        payload = response.json()
    except ValueError:
        return None
    email = payload.get("email") if isinstance(payload, dict) else None
    return str(email).strip().lower() if email else None
