#!/usr/bin/env bash
set -Eeuo pipefail

AI_PORT="${AI_SERVICE_PORT:-8100}"
API_PORT="${PORT:-8000}"

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  kill "${AI_PID:-}" "${API_PID:-}" 2>/dev/null || true
  wait "${AI_PID:-}" "${API_PID:-}" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT INT TERM

(
  cd ai-services
  exec python -m uvicorn app.main:app --host 127.0.0.1 --port "$AI_PORT"
) &
AI_PID=$!

(
  cd backend
  exec python -m uvicorn app.main:app --host 0.0.0.0 --port "$API_PORT"
) &
API_PID=$!

set +e
wait -n "$AI_PID" "$API_PID"
STATUS=$?
set -e
exit "$STATUS"
