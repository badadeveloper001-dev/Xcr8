"""Small, provider-agnostic SMTP mailer used by transactional notifications.

Email is deliberately best-effort: a provider outage must never turn a successful
signup, payment, or Pulse event into a failed request. Configure SMTP_* variables
to enable delivery; when they are absent the caller receives a clear status.
"""

from __future__ import annotations

from email.message import EmailMessage
import smtplib
from typing import Iterable

from app.core.config import settings


def is_email_configured() -> bool:
    """Return whether the minimum sender/relay settings are present."""
    return bool(
        str(settings.smtp_host or "").strip()
        and str(settings.smtp_from_email or "").strip()
    )


def _recipients(values: Iterable[str]) -> list[str]:
    return sorted(
        {
            str(value).strip()
            for value in values
            if str(value or "").strip()
        }
    )


def send_plain_email(
    subject: str,
    body: str,
    recipients: Iterable[str],
    *,
    html_body: str | None = None,
) -> tuple[bool, str]:
    """Send an email through configured SMTP without raising delivery errors.

    SMTP relays may be unauthenticated, so credentials are optional. STARTTLS
    and implicit TLS are mutually exclusive; SSL takes precedence if both are
    enabled. The return value is safe to persist in notification ledgers.
    """
    target_list = _recipients(recipients)
    host = str(settings.smtp_host or "").strip()
    from_email = str(settings.smtp_from_email or "").strip()
    if not host or not from_email or not target_list:
        return False, "SMTP not configured"

    message = EmailMessage()
    sender_name = str(settings.smtp_from_name or "XCR8").strip() or "XCR8"
    message["Subject"] = str(subject or "XCR8 notification").strip()
    message["From"] = f"{sender_name} <{from_email}>"
    message["To"] = ", ".join(target_list)
    message.set_content(str(body or "").strip() or "XCR8 notification.")
    if html_body:
        message.add_alternative(str(html_body), subtype="html")

    username = str(settings.smtp_username or "").strip()
    password = str(settings.smtp_password or "").strip()
    port = int(settings.smtp_port or 587)

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=15) as server:
                if username:
                    server.login(username, password)
                server.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.ehlo()
                if settings.smtp_use_tls:
                    server.starttls()
                    server.ehlo()
                if username:
                    server.login(username, password)
                server.send_message(message)
        return True, "sent"
    except (OSError, smtplib.SMTPException, ValueError) as exc:
        # Do not expose SMTP credentials or message contents to the caller/logs.
        return False, f"{exc.__class__.__name__}: delivery failed"
