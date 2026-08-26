"""Invoke Xcr8's authenticated due-post dispatcher from a Render cron job."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def normalized_base_url(value: str) -> str:
    cleaned = value.strip().rstrip("/")
    if not cleaned:
        raise RuntimeError("BACKEND_API_URL is required")
    if not cleaned.startswith(("http://", "https://")):
        cleaned = f"http://{cleaned}"
    return cleaned


def main() -> int:
    base_url = normalized_base_url(os.getenv("BACKEND_API_URL", ""))
    secret = os.getenv("CRON_SECRET", "").strip()
    if not secret:
        raise RuntimeError("CRON_SECRET is required")

    request = urllib.request.Request(
        f"{base_url}/api/v1/scheduling/dispatch-due",
        method="GET",
        headers={
            "Authorization": f"Bearer {secret}",
            "User-Agent": "xcr8-render-scheduler/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=50) as response:
            payload = response.read().decode("utf-8", errors="replace")
            print(payload)
            return 0 if 200 <= response.status < 300 else 1
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(json.dumps({"status": exc.code, "detail": detail}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
