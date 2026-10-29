#!/usr/bin/env bash
# k6 load test on a throwaway copy of the database: production build of the web tier + a dedicated AI service (2 workers) + the shared
# embedding service. PROFILE=normal (default) checks the NFR-PERF thresholds; PROFILE=stress ramps chat streams up to CHAT_MAX (default 200).
# Machine: shared 8 vCPU VM with CPU-only embeddings — results are a floor for production sizing, not a promise.
# Usage: [SCALE=0.35] scripts/loadtest.sh [normal|stress]      Web :3211, AI :8202. SCALE multiplies the virtual users.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
PROFILE=${1:-normal}
DC="docker compose --env-file .env -f deploy/docker-compose.dev.yml"
DB=legal_consult_load PORT=3211 AIPORT=8202 TS=$(date +%s) AI_NAME=lc-ai-load
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER -q"
OUT=web/test-results/load
cleanup() {
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  docker rm -f "$AI_NAME" >/dev/null 2>&1 || true
  $PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" || true
}
trap cleanup EXIT
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB OWNER $DB_ADMIN_USER"
$DC exec -T postgres sh -c "pg_dump -U $DB_ADMIN_USER $DB_NAME | psql -q -U $DB_ADMIN_USER -d $DB" >/dev/null
$PSQL -d "$DB" -c "GRANT CONNECT ON DATABASE $DB TO lc_web, lc_ai, lc_worker"
rm -rf "$OUT"; mkdir -p "$OUT"

$DC run -d --rm --name "$AI_NAME" -p 127.0.0.1:$AIPORT:8000 -e DB_NAME=$DB ai \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 75 --workers 2 >/dev/null
for _ in $(seq 1 60); do curl -sf -o /dev/null "http://127.0.0.1:$AIPORT/healthz" && break; sleep 1; done
ORIGIN="http://localhost:$PORT"
(cd web && exec env DB_NAME=$DB BETTER_AUTH_URL=$ORIGIN APP_URL=$ORIGIN NODE_ENV=production KB_SERVE_DRAFTS=true AI_SERVICE_URL=http://127.0.0.1:$AIPORT \
  EMAIL_VERIFICATION_REQUIRED=false AUTH_SIGNIN_RATE_MAX=100000 AUTH_SIGNUP_RATE_MAX=100000 RATE_API_PER_MIN=1000000 RATE_CHAT_PER_MIN=1000000 MEMBER_DAILY_MESSAGES=1000000 \
  DB_POOL_MAX=30 node node_modules/next/dist/bin/next start -p $PORT >test-results/load/web.log 2>&1) &
WEB_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null "$ORIGIN/login" && break; sleep 1; done
# warm-up: first embedding call and first page renders
curl -s -o /dev/null "$ORIGIN/login"

set +e
docker run --rm --network host -u "$(id -u):$(id -g)" -v "$PWD/web/tests/load:/load" -v "$PWD/$OUT:/out" \
  -e BASE_URL="$ORIGIN" -e PROFILE="$PROFILE" -e TS="$TS" -e USERS=60 -e CHAT_MAX="${CHAT_MAX:-200}" -e SCALE="${SCALE:-1}" \
  grafana/k6:latest run --summary-export=/out/summary.json /load/k6.js 2>&1 | tee "$OUT/k6.txt" | grep -vE "^\s*$" | tail -60
STATUS=${PIPESTATUS[0]}
set -e
echo "k6 exit: $STATUS"
[[ "$PROFILE" == stress ]] && exit 0
exit "$STATUS"
