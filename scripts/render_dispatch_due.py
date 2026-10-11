"""Invoke Xcr8's authenticated scheduled tasks from a Render cron job."""

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


def invoke(base_url: str, secret: str, path: str, method: str) -> int:
    request = urllib.request.Request(
        f"{base_url}{path}",
        method=method,
        headers={
            "Authorization": f"Bearer {secret}",
            "User-Agent": "xcr8-render-scheduler/1.1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=50) as response:
            print(json.dumps({"path": path, "status": response.status, "result": response.read().decode("utf-8", errors="replace")}))
            return 0 if 200 <= response.status < 300 else 1
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(json.dumps({"path": path, "status": exc.code, "detail": detail}), file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(json.dumps({"path": path, "error": str(exc.reason)}), file=sys.stderr)
        return 1


def main() -> int:
    base_url = normalized_base_url(os.getenv("BACKEND_API_URL", ""))
    secret = os.getenv("CRON_SECRET", "").strip()
    if not secret:
        raise RuntimeError("CRON_SECRET is required")

    # A scheduling failure must not prevent account-deletion recovery from running.
    results = [
        invoke(base_url, secret, "/api/v1/scheduling/dispatch-due", "GET"),
        invoke(base_url, secret, "/api/v1/account/deletion/process-pending", "POST"),
    ]
    return 0 if all(result == 0 for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
