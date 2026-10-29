#!/usr/bin/env bash
# Organization workspace + tenant-isolation E2E on a throwaway copy of the database (M11, FR-ORG-*, NFR-SEC-012).
# Web runs on :3203 against the copy; mail goes to the dev mailpit (recipients org-e2e-*@example.test).
# Chats are seeded with SQL (the AI service always writes to the real database, so the test never calls it).
# Needs a current `cd web && corepack pnpm run build` and the dev compose stack (postgres, mailpit, worker image) up.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
DC="docker compose --env-file .env -f deploy/docker-compose.dev.yml"
DB=legal_consult_org PORT=3203 TS=$(date +%s)
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER -q"
Q() { $PSQL -d "$DB" -t -A -c "$1"; }

cleanup() {
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  $PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" || true
}
trap cleanup EXIT

$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB OWNER $DB_ADMIN_USER"
$DC exec -T postgres sh -c "pg_dump -U $DB_ADMIN_USER $DB_NAME | psql -q -U $DB_ADMIN_USER -d $DB" >/dev/null
$PSQL -d "$DB" -c "GRANT CONNECT ON DATABASE $DB TO lc_web, lc_ai, lc_worker"

ORIGIN="http://localhost:$PORT"
(cd web && exec env DB_NAME=$DB BETTER_AUTH_URL=$ORIGIN APP_URL=$ORIGIN NODE_ENV=production EMAIL_VERIFICATION_REQUIRED=true MAIL_LIVE=true AUTH_SIGNIN_RATE_MAX=200 \
  node node_modules/next/dist/bin/next start -p $PORT >/dev/null 2>&1) &
WEB_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null "$ORIGIN/login" && break; sleep 1; done

# users: verified, terms accepted (they do not go through the consent form here)
for who in alice bob carol dave erin sysadmin; do
  addr="org-e2e-$who-$TS@example.test"
  curl -sf -o /dev/null -X POST "$ORIGIN/api/auth/sign-up/email" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
    -d "{\"email\":\"$addr\",\"password\":\"correct-horse-9\",\"name\":\"$who\"}"
  Q "UPDATE app.users SET email_verified = true WHERE email = '$addr'" >/dev/null
  Q "INSERT INTO app.user_consents (user_id, purpose, doc_version, granted)
     SELECT u.id, c.p::app.consent_purpose, c.v, true FROM app.users u,
       (VALUES ('service_terms','terms-2026-09'),('privacy_notice','privacy-2026-09')) c(p, v) WHERE u.email = '$addr'" >/dev/null
done
scripts/set-role.sh "org-e2e-sysadmin-$TS@example.test" admin "$DB" >/dev/null

mkdir -p web/test-results/org
run() {
  docker run --rm --network host -u "$(id -u):$(id -g)" -e HOME=/tmp -e BASE_URL="$ORIGIN" -e MAIL_API=http://127.0.0.1:58025 \
    -e TS="$TS" -e PHASE="$1" -v "$PWD/web":/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble node tests/org-e2e.mjs
}
run 1
ORG_A=$(node -e "console.log(require('./web/test-results/org/state.json').orgA)")
ORG_B=$(node -e "console.log(require('./web/test-results/org/state.json').orgB)")

# seed chats (title = what the test looks for)
uid() { Q "SELECT id FROM app.users WHERE email = 'org-e2e-$1-$TS@example.test'"; }
chat() { # <owner> <org|NULL> <visibility> <title>
  local org="NULL"; [[ $2 != NULL ]] && org="'$2'"
  Q "WITH c AS (INSERT INTO app.chats (user_id, org_id, visibility, title, last_message_at)
                VALUES ($(uid "$1"), $org, '$3', '$4', now()) RETURNING id),
          m AS (INSERT INTO app.messages (chat_id, role, content)
                SELECT id, 'user'::app.message_role, 'สัญญาข้อ 7 ปรับวันละ 20,000 บาท' FROM c
                UNION ALL SELECT id, 'assistant'::app.message_role, 'ตามมาตรา 383 ศาลลดเบี้ยปรับได้' FROM c)
     SELECT id FROM c"
}
BOB_PRIVATE=$(chat bob "$ORG_A" private chat-bob-private)
ALICE_PRIVATE=$(chat alice "$ORG_A" private chat-alice-private)
ALICE_SHARED=$(chat alice "$ORG_A" org chat-alice-shared)
chat bob NULL private chat-bob-personal >/dev/null
DAVE_OWN=$(chat dave "$ORG_B" private chat-dave-private)
chat erin NULL private chat-erin-personal >/dev/null
printf '{"bobPrivate":"%s","alicePrivate":"%s","aliceShared":"%s","daveOwn":"%s"}' "$BOB_PRIVATE" "$ALICE_PRIVATE" "$ALICE_SHARED" "$DAVE_OWN" > web/test-results/org/chats.json
run 2

# the worker erases the organization once its grace period is over, and reports what it removed
Q "UPDATE app.organizations SET deletion_scheduled_at = now() - interval '1 day' WHERE id = '$ORG_A'" >/dev/null
RESULT=$($DC run --rm -T -e DB_NAME=$DB worker python -c "
import psycopg
from psycopg.rows import dict_row
from app.core.config import get_settings
from worker.jobs import HANDLERS
with psycopg.connect(get_settings().db_conninfo, row_factory=dict_row, autocommit=True) as c:
    print(HANDLERS['purge_deleted_orgs'](c, {}))
" 2>/dev/null | tail -1)
echo "purge: $RESULT"
[[ $(Q "SELECT count(*) FROM app.organizations WHERE id = '$ORG_A'") == 0 ]] || { echo "FAIL: org A still exists"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.chats WHERE org_id = '$ORG_A'") == 0 ]] || { echo "FAIL: org A chats remain"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.chats WHERE org_id = '$ORG_B'") == 1 ]] || { echo "FAIL: org B data was touched"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.audit_log WHERE action = 'org.purged' AND meta->>'org_id' = '$ORG_A'") == 1 ]] || { echo "FAIL: purge not audited"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.audit_log WHERE action = 'org.cross_tenant_denied'") -ge 10 ]] || { echo "FAIL: cross-tenant attempts not logged"; exit 1; }
echo '{"ok":true,"purge":"complete","org_b_untouched":true,"cross_tenant_denials_logged":true}'
