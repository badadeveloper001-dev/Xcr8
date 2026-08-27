import smtplib

from app.core.config import settings
from app.services import email as email_service


def test_mailer_is_safe_noop_when_smtp_is_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "smtp_from_email", "")
    sent, detail = email_service.send_plain_email(
        "Subject",
        "Body",
        ["creator@example.com"],
    )
    assert sent is False
    assert detail == "SMTP not configured"


def test_mailer_sends_authenticated_starttls_message(monkeypatch):
    class FakeSMTP:
        instances = []

        def __init__(self, host, port, timeout):
            self.host = host
            self.port = port
            self.timeout = timeout
            self.started_tls = False
            self.logged_in = False
            self.message = None
            self.__class__.instances.append(self)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def ehlo(self):
            return None

        def starttls(self):
            self.started_tls = True

        def login(self, username, password):
            self.logged_in = (username, password)

        def send_message(self, message):
            self.message = message

    monkeypatch.setattr(email_service.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_from_email", "no-reply@example.com")
    monkeypatch.setattr(settings, "smtp_from_name", "XCR8")
    monkeypatch.setattr(settings, "smtp_username", "smtp-user")
    monkeypatch.setattr(settings, "smtp_password", "smtp-password")
    monkeypatch.setattr(settings, "smtp_use_tls", True)
    monkeypatch.setattr(settings, "smtp_use_ssl", False)

    sent, detail = email_service.send_plain_email(
        "Welcome",
        "Hello creator",
        ["creator@example.com", "creator@example.com"],
    )

    assert sent is True
    assert detail == "sent"
    smtp = FakeSMTP.instances[-1]
    assert smtp.started_tls is True
    assert smtp.logged_in == ("smtp-user", "smtp-password")
    assert smtp.message["To"] == "creator@example.com"
    assert smtp.message.get_content().strip() == "Hello creator"
