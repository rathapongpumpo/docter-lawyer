#!/usr/bin/env bash
# Chat E2E on a throwaway copy of the database with its OWN AI service (extractive engine) pointed at the copy, so real
# streaming, history, folders, feedback, bookmarks, regenerate, scope and share links run end-to-end without touching real data.
# Web :3204, AI :8201. Needs a current `cd web && corepack pnpm run build` and the dev compose stack.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
DC="docker compose --env-file .env -f deploy/docker-compose.dev.yml"
DB=legal_consult_chat PORT=3204 AIPORT=8201 TS=$(date +%s) AI_NAME=lc-ai-e2e
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER -q"
Q() { $PSQL -d "$DB" -t -A -c "$1"; }

cleanup() {
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  docker rm -f "$AI_NAME" >/dev/null 2>&1 || true
  $PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" || true
}
trap cleanup EXIT

$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB OWNER $DB_ADMIN_USER"
$DC exec -T postgres sh -c "pg_dump -U $DB_ADMIN_USER $DB_NAME | psql -q -U $DB_ADMIN_USER -d $DB" >/dev/null
$PSQL -d "$DB" -c "GRANT CONNECT ON DATABASE $DB TO lc_web, lc_ai, lc_worker"

$DC run -d --rm --name "$AI_NAME" -p 127.0.0.1:$AIPORT:8000 -e DB_NAME=$DB -e PNC_ENABLED=false -e PNC_PRIMARY=false ai \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 75 >/dev/null
for _ in $(seq 1 60); do curl -sf -o /dev/null "http://127.0.0.1:$AIPORT/healthz" && break; sleep 1; done
curl -sf -o /dev/null "http://127.0.0.1:$AIPORT/healthz" || { echo "AI service did not start"; exit 1; }

ORIGIN="http://localhost:$PORT"
mkdir -p web/test-results/chat
(cd web && exec env DB_NAME=$DB BETTER_AUTH_URL=$ORIGIN APP_URL=$ORIGIN NODE_ENV=production AI_SERVICE_URL=http://127.0.0.1:$AIPORT \
  EMAIL_VERIFICATION_REQUIRED=false AUTH_SIGNIN_RATE_MAX=200 node node_modules/next/dist/bin/next start -p $PORT >test-results/chat/web.log 2>&1) &
WEB_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null "$ORIGIN/login" && break; sleep 1; done

for who in alice bob; do
  addr="chat-e2e-$who-$TS@example.test"
  curl -sf -o /dev/null -X POST "$ORIGIN/api/auth/sign-up/email" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
    -d "{\"email\":\"$addr\",\"password\":\"correct-horse-9\",\"name\":\"$who\"}"
  Q "INSERT INTO app.user_consents (user_id, purpose, doc_version, granted)
     SELECT u.id, c.p::app.consent_purpose, c.v, true FROM app.users u,
       (VALUES ('service_terms','terms-2026-09'),('privacy_notice','privacy-2026-09')) c(p, v) WHERE u.email = '$addr'" >/dev/null
done

mkdir -p web/test-results/chat
run() {
  docker run --rm --network host -u "$(id -u):$(id -g)" -e HOME=/tmp -e BASE_URL="$ORIGIN" -e TS="$TS" -e PHASE="$1" \
    -v "$PWD/web":/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble node tests/chat-e2e.mjs
}
run 1

# feedback data: reasons, comment, permission and the answer's model/prompt are all linked (FR-CHAT-016 AC3)
[[ $(Q "SELECT count(*) FROM app.message_feedback WHERE rating = -1 AND reasons @> ARRAY['incomplete','outdated']::app.feedback_reason[] AND allow_review AND comment = 'ไม่มีตัวอย่างการคำนวณ'") == 1 ]] \
  || { echo "FAIL: feedback row"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.message_feedback f JOIN app.messages m ON m.id = f.message_id WHERE m.model IS NOT NULL") -ge 1 ]] || { echo "FAIL: feedback not linked to model"; exit 1; }
# an answer that was regenerated is kept, marked superseded
[[ $(Q "SELECT count(*) FROM app.messages WHERE role = 'assistant' AND is_active = false AND superseded_by IS NOT NULL") -ge 1 ]] || { echo "FAIL: superseded answer missing"; exit 1; }
# the deleted chat is soft-deleted (purged by the worker after 30 days)
[[ $(Q "SELECT count(*) FROM app.chats WHERE deleted_at IS NOT NULL") -ge 2 ]] || { echo "FAIL: soft delete"; exit 1; }
# no raw chat text in the AI service log (CLAUDE.md rule 8)
if docker logs "$AI_NAME" 2>&1 | grep -q "ส่งงานช้า"; then echo "FAIL: chat text found in the AI log"; exit 1; fi

# phase 2: an expired link
Q "UPDATE app.chat_shares SET expires_at = now() - interval '1 day' WHERE revoked_at IS NULL AND created_at > now() - interval '1 hour' AND password_hash IS NULL" >/dev/null
run 2
# worker purge: soft-deleted chats older than 30 days go, younger ones stay
Q "UPDATE app.chats SET deleted_at = now() - interval '31 days' WHERE deleted_at IS NOT NULL AND id = (SELECT id FROM app.chats WHERE deleted_at IS NOT NULL ORDER BY deleted_at LIMIT 1)" >/dev/null
BEFORE=$(Q "SELECT count(*) FROM app.chats")
RESULT=$($DC run --rm -T -e DB_NAME=$DB worker python -c "
import psycopg
from psycopg.rows import dict_row
from app.core.config import get_settings
from worker.jobs import HANDLERS
with psycopg.connect(get_settings().db_conninfo, row_factory=dict_row, autocommit=True) as c:
    print(HANDLERS['purge_soft_deleted'](c, {}))
" 2>/dev/null | tail -1)
echo "purge: $RESULT"
[[ $(Q "SELECT count(*) FROM app.chats") == $((BEFORE - 1)) ]] || { echo "FAIL: purge_soft_deleted"; exit 1; }
echo '{"ok":true,"feedback_stored":true,"no_chat_text_in_ai_log":true,"purge":"ok"}'
