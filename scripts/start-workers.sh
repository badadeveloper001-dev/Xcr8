#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
source .venv/bin/activate

if ! python - <<'PY'
from urllib.parse import urlparse
import socket
import sys

url = urlparse("redis://localhost:6379/1")
host = url.hostname or "localhost"
port = url.port or 6379

s = socket.socket()
s.settimeout(1.0)
try:
	s.connect((host, port))
except OSError:
	sys.exit(1)
finally:
	s.close()

sys.exit(0)
PY
then
  echo "[start-workers] Redis not reachable on localhost:6379; skipping Celery worker startup"
  exit 0
fi

cd backend
celery -A app.workers.celery_app:celery_app worker -Q xcr8 --loglevel=info -n "xcr8-worker-$$@%h"
