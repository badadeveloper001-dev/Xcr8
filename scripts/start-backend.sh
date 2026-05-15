#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
source .venv/bin/activate

if python - <<'PY'
import socket
import sys

s = socket.socket()
s.settimeout(0.7)
try:
	s.connect(("127.0.0.1", 8000))
except OSError:
	sys.exit(1)
finally:
	s.close()

sys.exit(0)
PY
then
  echo "[start-backend] Port 8000 is already in use; assuming backend is already running"
  exit 0
fi

uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
