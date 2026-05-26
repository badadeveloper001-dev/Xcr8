#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <API_BASE_URL>"
  echo "Example: $0 https://xcr8-creator-os-opal.vercel.app/api/v1"
  exit 1
fi

API_BASE_URL="${1%/}"
STAMP="$(date +%s)"
EMAIL="smoke.${STAMP}@example.com"
USERNAME="smoke${STAMP}"
PASSWORD="SmokeTest9"

echo "Running smoke test against: ${API_BASE_URL}"
echo "Test account: ${EMAIL}"

echo "[1/6] Health"
HEALTH="$(curl -fsS "${API_BASE_URL}/health")"
echo "${HEALTH}" | /workspaces/Xcr8/.venv/bin/python -c 'import json,sys; data=json.load(sys.stdin); assert data.get("status")=="ok"; print("health=ok")'

echo "[2/6] Database health"
HEALTH_DB="$(curl -fsS "${API_BASE_URL}/health/db")"
echo "${HEALTH_DB}" | /workspaces/Xcr8/.venv/bin/python -c 'import json,sys; data=json.load(sys.stdin); assert data.get("database")=="ok"; print("db=ok")'

echo "[3/6] Signup"
SIGNUP_PAYLOAD=$(cat <<JSON
{"full_name":"Smoke Test","username":"${USERNAME}","email":"${EMAIL}","password":"${PASSWORD}","confirm_password":"${PASSWORD}","language":"english","timezone":"Africa/Lagos"}
JSON
)
SIGNUP="$(curl -fsS -X POST "${API_BASE_URL}/auth/signup" -H 'content-type: application/json' --data "${SIGNUP_PAYLOAD}")"
USER_ID="$(echo "${SIGNUP}" | /workspaces/Xcr8/.venv/bin/python -c 'import json,sys; d=json.load(sys.stdin); print(d["user_id"])')"
echo "user_id=${USER_ID}"

echo "[4/6] Login"
LOGIN_PAYLOAD=$(cat <<JSON
{"email":"${EMAIL}","password":"${PASSWORD}","remember_me":true}
JSON
)
curl -fsS -X POST "${API_BASE_URL}/auth/login" -H 'content-type: application/json' --data "${LOGIN_PAYLOAD}" >/dev/null
echo "login=ok"

echo "[5/6] Draft creation"
DRAFT_PAYLOAD=$(cat <<JSON
{"user_id":${USER_ID},"title":"Smoke Draft","media_url":"https://images.unsplash.com/photo-1519389950473-47ba0277781c","media_type":"image","master_caption":"Shipping the creator stack today","primary_language":"english","selected_platforms":["instagram"],"target_languages":["english"]}
JSON
)
DRAFT="$(curl -fsS -X POST "${API_BASE_URL}/distribution/draft" -H 'content-type: application/json' --data "${DRAFT_PAYLOAD}")"
POST_ID="$(echo "${DRAFT}" | /workspaces/Xcr8/.venv/bin/python -c 'import json,sys; d=json.load(sys.stdin); print(d["post_id"])')"
echo "post_id=${POST_ID}"

echo "[6/7] Schedule and dashboard"
SCHEDULED_FOR="$(/workspaces/Xcr8/.venv/bin/python -c 'from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc)+timedelta(hours=2)).isoformat())')"
SCHEDULE_PAYLOAD=$(cat <<JSON
{"user_id":${USER_ID},"post_id":${POST_ID},"platform":"instagram","scheduled_for":"${SCHEDULED_FOR}","timezone":"Africa/Lagos"}
JSON
)
curl -fsS -X POST "${API_BASE_URL}/scheduling/queue" -H 'content-type: application/json' --data "${SCHEDULE_PAYLOAD}" >/dev/null
DASHBOARD="$(curl -fsS "${API_BASE_URL}/dashboard/overview/${USER_ID}")"
echo "${DASHBOARD}" | /workspaces/Xcr8/.venv/bin/python -c 'import json,sys; d=json.load(sys.stdin); assert d.get("drafts",0) >= 0; assert d.get("scheduled",0) >= 1; print("dashboard=ok")'

echo "[7/7] AI usage analytics"
AI_USAGE="$(curl -fsS "${API_BASE_URL}/analytics/ai-usage/${USER_ID}")"
echo "${AI_USAGE}" | /workspaces/Xcr8/.venv/bin/python -c 'import json,sys; d=json.load(sys.stdin); assert d.get("total_generations",0) >= 1; assert "most_used_template" in d; print("ai_usage=ok")'

echo "Smoke test completed successfully."
