#!/usr/bin/env bash
# Operations E2E on a throwaway copy of the database: kill switch (guest chat / all chat / uploads) from the back office,
# per-minute rate limits with Retry-After, audit of switch changes, role gating. Web :3209 with RATE_API_PER_MIN=40 and
# RATE_CHAT_PER_MIN=3 so the limits can be reached quickly. Needs redis (counters) and ai up.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
DC="docker compose --env-file .env -f deploy/docker-compose.dev.yml"
DB=legal_consult_ops PORT=3209 TS=$(date +%s)
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER -q"
Q() { $PSQL -d "$DB" -t -A -c "$1"; }
OUT=web/test-results/ops

cleanup() {
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  $PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" || true
}
trap cleanup EXIT

$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB OWNER $DB_ADMIN_USER"
$DC exec -T postgres sh -c "pg_dump -U $DB_ADMIN_USER $DB_NAME | psql -q -U $DB_ADMIN_USER -d $DB" >/dev/null
$PSQL -d "$DB" -c "GRANT CONNECT ON DATABASE $DB TO lc_web, lc_ai, lc_worker"
rm -rf "$OUT"; mkdir -p "$OUT"
ORIGIN="http://localhost:$PORT"
# fresh counters: the limiter keys are per user id, and ids repeat across throwaway databases
$DC exec -T redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning --scan --pattern 'lc:rl:*' | xargs -r $DC exec -T redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning del >/dev/null || true
(cd web && exec env DB_NAME=$DB BETTER_AUTH_URL=$ORIGIN APP_URL=$ORIGIN NODE_ENV=production KB_SERVE_DRAFTS=true EMAIL_VERIFICATION_REQUIRED=false AUTH_SIGNIN_RATE_MAX=200 \
  RATE_API_PER_MIN=40 RATE_CHAT_PER_MIN=3 RATE_GUEST_CHAT_PER_MIN=3 \
  node node_modules/next/dist/bin/next start -p $PORT >test-results/ops/web.log 2>&1) &
WEB_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null "$ORIGIN/login" && break; sleep 1; done

for who in admin member chatty; do
  addr="ops-e2e-$who-$TS@example.test"
  curl -sf -o /dev/null -X POST "$ORIGIN/api/auth/sign-up/email" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "{\"email\":\"$addr\",\"password\":\"correct-horse-9\",\"name\":\"$who\"}"
  Q "INSERT INTO app.user_consents (user_id, purpose, doc_version, granted)
     SELECT u.id, c.p::app.consent_purpose, c.v, true FROM app.users u,
       (VALUES ('service_terms','terms-2026-09'),('privacy_notice','privacy-2026-09')) c(p, v) WHERE u.email = '$addr'" >/dev/null
done
scripts/set-role.sh "ops-e2e-admin-$TS@example.test" admin "$DB" >/dev/null

PW="docker run --rm --network host -u $(id -u):$(id -g) -e HOME=/tmp -v $PWD/web:/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble"
$PW env BASE_URL="$ORIGIN" TS="$TS" node tests/ops-e2e.mjs

[[ $(Q "SELECT count(*) FROM app.audit_log WHERE action = 'system.kill_switch_changed'") -ge 4 ]] || { echo "FAIL: kill switch changes were not audited"; exit 1; }
echo "ok: every switch change is in the audit log"
echo '{"ok":true,"kill_switch":"audited","rate_limits":"enforced"}'
