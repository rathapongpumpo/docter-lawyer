#!/usr/bin/env bash
# Review-workflow E2E on a throwaway copy of the database — never publishes anything in the real data.
# Copies the DB → runs web on :3201 against the copy → creates an editor and a reviewer → runs
# web/tests/review-e2e.mjs (submit → checklist → approve) → runs the worker once → drops the copy.
# Needs a current `cd web && corepack pnpm run build`.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
DC="docker compose --env-file .env -f deploy/docker-compose.dev.yml"
DB=legal_consult_e2e PORT=3201 TS=$(date +%s)
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER -q"

cleanup() {
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  $PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" || true
}
trap cleanup EXIT

$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB OWNER $DB_ADMIN_USER"
$DC exec -T postgres sh -c "pg_dump -U $DB_ADMIN_USER $DB_NAME | psql -q -U $DB_ADMIN_USER -d $DB" >/dev/null
$PSQL -d "$DB" -c "GRANT CONNECT ON DATABASE $DB TO lc_web, lc_ai, lc_worker"

(cd "${WEB_BUILD_DIR:-web}" && exec env DB_NAME=$DB BETTER_AUTH_URL=http://localhost:$PORT APP_URL=http://localhost:$PORT NODE_ENV=production \
  node node_modules/next/dist/bin/next start -p $PORT >/dev/null 2>&1) &
WEB_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done

for who in editor reviewer; do
  curl -sf -X POST "http://localhost:$PORT/api/auth/sign-up/email" -H 'Content-Type: application/json' \
    -H "Origin: http://localhost:$PORT" -o /dev/null \
    -d "{\"email\":\"e2e-$who-$TS@example.com\",\"password\":\"correct-horse-9\",\"name\":\"e2e $who\"}"
  scripts/set-role.sh "e2e-$who-$TS@example.com" "$who" "$DB" >/dev/null
  # members must have accepted the current terms (consent gate); the browser test does not go through /consent
  $PSQL -d "$DB" -c "INSERT INTO app.user_consents (user_id, purpose, doc_version, granted)
    SELECT u.id, c.p::app.consent_purpose, c.v, true FROM app.users u,
      (VALUES ('service_terms','terms-2026-09'),('privacy_notice','privacy-2026-09')) c(p, v)
    WHERE u.email = 'e2e-$who-$TS@example.com'"
done
TERM_ID=$($PSQL -d "$DB" -t -A -c "SELECT id FROM kb.glossary_terms WHERE status = 'draft' ORDER BY id LIMIT 1")

mkdir -p web/test-results/review
docker run --rm --network host -u "$(id -u):$(id -g)" -e HOME=/tmp -e BASE_URL="http://localhost:$PORT" \
  -e TS="$TS" -e TERM_ID="$TERM_ID" -v "$PWD/web":/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble \
  node tests/review-e2e.mjs

# the worker makes the approved term searchable
$DC run --rm -T -e DB_NAME=$DB worker python -c "
import psycopg
from psycopg.rows import dict_row
from app.core.config import get_settings
from worker.__main__ import run_once
with psycopg.connect(get_settings().db_conninfo, row_factory=dict_row) as c:
    run_once(c)
" 2>/dev/null
published=$($PSQL -d "$DB" -t -A -c "SELECT bool_and(is_published) FROM kb.chunks WHERE source_type = 'glossary' AND source_id = $TERM_ID")
[[ "$published" == "t" ]] || { echo "FAIL: chunk not published after reindex"; exit 1; }
echo "review workflow e2e passed"
