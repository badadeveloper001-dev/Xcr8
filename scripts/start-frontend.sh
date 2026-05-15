#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

port_in_use() {
	python3 - <<'PY'
import errno, socket, sys

def can_bind(host, family):
    s = socket.socket(family, socket.SOCK_STREAM)
    try:
        s.bind((host, 3000))
        return True
    except OSError as exc:
        return exc.errno != errno.EADDRINUSE
    finally:
        s.close()

if not can_bind("0.0.0.0", socket.AF_INET):
    sys.exit(0)
try:
    if not can_bind("::", socket.AF_INET6):
        sys.exit(0)
except OSError:
    pass
sys.exit(1)
PY
}

if port_in_use; then
	echo "[start-frontend] Port 3000 is already in use; assuming frontend is already running"
	exit 0
fi

if command -v pnpm >/dev/null 2>&1 && pnpm --version >/dev/null 2>&1; then
	pnpm --dir frontend dev
else
	echo "[start-frontend] pnpm unavailable; falling back to npm"
	npm --prefix frontend run dev
fi

