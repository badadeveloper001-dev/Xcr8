"""Encryption helpers for durable account-deletion recovery payloads."""

from __future__ import annotations

import json

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet() -> Fernet:
    key = str(settings.account_deletion_encryption_key or "").strip()
    if not key:
        raise RuntimeError("ACCOUNT_DELETION_ENCRYPTION_KEY must be configured before account deletion.")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise RuntimeError("ACCOUNT_DELETION_ENCRYPTION_KEY must be a valid Fernet key.") from exc


def encrypt_payload(payload: dict) -> str:
    """Encrypt sensitive cleanup references before they enter the database."""
    serialized = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return _fernet().encrypt(serialized).decode("ascii")


def decrypt_payload(token: str) -> dict:
    """Decrypt a recovery payload; callers must never log its contents."""
    try:
        value = _fernet().decrypt(token.encode("ascii"))
        payload = json.loads(value.decode("utf-8"))
    except (InvalidToken, UnicodeEncodeError, ValueError, TypeError) as exc:
        raise RuntimeError("The encrypted account-deletion recovery payload could not be read.") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("The encrypted account-deletion recovery payload has an invalid shape.")
    return payload
