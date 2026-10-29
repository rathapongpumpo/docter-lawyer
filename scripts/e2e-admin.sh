#!/usr/bin/env bash
# Back-office E2E on a throwaway copy of the database (M10): access matrix, users, audit viewer, DSR queue + digest job, announcement,
# feedback queue (consent + masking), guardrails, usage, review workflow API guards. Web :3206.
set -euo pipefail
cd "$(dirname "$0")/.."; ROOT=$PWD
set -a; source .env; set +a
DC="docker compose --env-file .env -f deploy/docker-compose.dev.yml"
DB=legal_consult_adm PORT=3206 TS=$(date +%s)
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER -q"
Q() { $PSQL -d "$DB" -t -A -c "$1"; }
OUT=web/test-results/admin

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
(cd "${WEB_BUILD_DIR:-web}" && exec env DB_NAME=$DB BETTER_AUTH_URL=$ORIGIN APP_URL=$ORIGIN NODE_ENV=production EMAIL_VERIFICATION_REQUIRED=false AUTH_SIGNIN_RATE_MAX=200 \
  node node_modules/next/dist/bin/next start -p $PORT >"$ROOT/$OUT/web.log" 2>&1) &
WEB_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null "$ORIGIN/login" && break; sleep 1; done

for who in admin editor reviewer member victim; do
  addr="admin-e2e-$who-$TS@example.test"
  curl -sf -o /dev/null -X POST "$ORIGIN/api/auth/sign-up/email" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
    -d "{\"email\":\"$addr\",\"password\":\"correct-horse-9\",\"name\":\"$who\"}"
  Q "INSERT INTO app.user_consents (user_id, purpose, doc_version, granted)
     SELECT u.id, c.p::app.consent_purpose, c.v, true FROM app.users u,
       (VALUES ('service_terms','terms-2026-09'),('privacy_notice','privacy-2026-09')) c(p, v) WHERE u.email = '$addr'" >/dev/null
done
for pair in admin:admin editor:editor reviewer:reviewer; do scripts/set-role.sh "admin-e2e-${pair%%:*}-$TS@example.test" "${pair##*:}" "$DB" >/dev/null; done

PW="docker run --rm --network host -u $(id -u):$(id -g) -e HOME=/tmp -v $PWD/web:/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble"
run() { $PW env BASE_URL="$ORIGIN" TS="$TS" PHASE="$1" OUT_DIR=test-results/admin node tests/admin-e2e.mjs; }
run 1

# the audit log is append-only for the application role (FR-ADM-018 AC1): real DELETE / UPDATE attempts as lc_web must fail
for stmt in "DELETE FROM app.audit_log" "UPDATE app.audit_log SET action = 'x'" "TRUNCATE app.audit_log"; do
  OUTPUT=$($DC exec -T -e PGPASSWORD="$DB_WEB_PASSWORD" postgres psql -U lc_web -d "$DB" -q -c "$stmt" 2>&1 || true)
  [[ "$OUTPUT" == *"permission denied"* ]] || { echo "FAIL: lc_web could run: $stmt ($OUTPUT)"; exit 1; }
done

# ---- seed: feedback (allowed / denied / organization chat), guardrail events, DSR rows
# The copy carries whatever the live database holds; the assertions count only what this script inserts, so start from empty tables (copy only).
$PSQL -d "$DB" -c "DELETE FROM app.message_feedback" -c "DELETE FROM app.guardrail_events" -c "DELETE FROM app.dsr_requests"
uid() { Q "SELECT id FROM app.users WHERE email = 'admin-e2e-$1-$TS@example.test'"; }
M=$(uid member)
ORG=$(Q "INSERT INTO app.organizations (name, slug) VALUES ('บริษัท ทดสอบ', 'adm-$TS') RETURNING id")
Q "INSERT INTO app.members (organization_id, user_id, role) VALUES ('$ORG', $M, 'org_member')" >/dev/null
mkchat() { # <org|NULL> <question> <answer>  → prints feedback id
  local org="NULL"; [[ $1 != NULL ]] && org="'$1'"
  Q "WITH c AS (INSERT INTO app.chats (user_id, org_id, title) VALUES ($M, $org, 't') RETURNING id),
          u AS (INSERT INTO app.messages (chat_id, role, content) SELECT id, 'user'::app.message_role, \$q\$$2\$q\$ FROM c RETURNING id, chat_id),
          a AS (INSERT INTO app.messages (chat_id, role, content, model, parent_message_id, verification_status)
                SELECT u.chat_id, 'assistant'::app.message_role, \$q\$$3\$q\$, 'extractive', u.id, 'passed' FROM u RETURNING id),
          ci AS (INSERT INTO app.message_citations (message_id, n, kind, ref_id, label, title, snippet, url, as_of)
                 SELECT id, 1, 'law_section'::app.citation_kind, '1', 'ป.พ.พ. ม.383', 'เบี้ยปรับ', 's', '/law/ccc/383', now()::date FROM a RETURNING message_id)
     INSERT INTO app.message_feedback (message_id, user_id, rating, reasons, comment, allow_review)
     SELECT a.id, $M, -1, ARRAY['incomplete','outdated']::app.feedback_reason[], \$q\$$4\$q\$, $5 FROM a RETURNING id"
}
FB_ALLOWED=$(mkchat NULL 'ลูกค้าโทร 081-234-5678 บอกให้จ่ายค่าปรับวันละ 20,000 ต้องจ่ายไหม' 'ตามมาตรา 383 ศาลลดเบี้ยปรับได้' 'ไม่ครบ โทรกลับ 081-234-5678' true)
FB_DENIED=$(mkchat NULL 'คำถามส่วนตัวที่ไม่อนุญาต' 'คำตอบ' 'ไม่ตรงคำถาม' false)
FB_ORG=$(mkchat "$ORG" 'คำถามขององค์กร' 'คำตอบ' 'ขององค์กร' true)
$PSQL -d "$DB" -c "INSERT INTO app.guardrail_events (stage, verdict, category, reason) VALUES ('input','blocked','off_topic','นอกขอบเขต'),('input','blocked','prompt_injection','พยายามเปลี่ยนคำสั่ง'),('output','flagged','unverified_section','มาตราที่ไม่อยู่ในคลัง')"
U=$(uid victim)
$PSQL -d "$DB" -c "INSERT INTO app.dsr_requests (user_id, request_type, status, due_at) VALUES ($U, 'export', 'received', now() + interval '3 days'), ($U, 'access', 'in_progress', now() - interval '2 days'), (NULL, 'object', 'received', now() + interval '25 days')"
TERM=$(Q "INSERT INTO kb.glossary_terms (slug, term_th, short_def) VALUES ('adm-e2e-$TS', 'คำทดสอบหลังบ้าน', 'คำอธิบายสำหรับทดสอบ') RETURNING id")
printf '{"fbAllowed":%s,"fbDenied":%s,"fbOrg":%s,"termId":%s}' "$FB_ALLOWED" "$FB_DENIED" "$FB_ORG" "$TERM" > "$OUT/seed.json"
run 2

# the approved term is published
[[ $(Q "SELECT status::text FROM kb.glossary_terms WHERE id = $TERM") == "published" ]] || { echo "FAIL: term not published"; exit 1; }

# the DSR digest job mails counts and ids, never who asked
curl -s -X DELETE http://127.0.0.1:58025/api/v1/messages >/dev/null
Q "INSERT INTO app.jobs (type) VALUES ('dsr_digest')" >/dev/null
$DC run --rm -T -e DB_NAME=$DB worker python -c "
import psycopg
from psycopg.rows import dict_row
from app.core.config import get_settings
from worker.__main__ import run_once
with psycopg.connect(get_settings().db_conninfo, row_factory=dict_row) as c:
    while run_once(c): pass
" 2>/dev/null
sleep 1
MAIL=$(curl -s "http://127.0.0.1:58025/api/v1/search?query=$(python3 -c "import urllib.parse;print(urllib.parse.quote('to:admin-e2e-admin-$TS@example.test'))")")
[[ $(echo "$MAIL" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages_count'])") -ge 1 ]] || { echo "FAIL: digest mail not received"; exit 1; }
ID=$(echo "$MAIL" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages'][0]['ID'])")
BODY=$(curl -s "http://127.0.0.1:58025/api/v1/message/$ID" | python3 -c "import sys,json;print(json.load(sys.stdin)['Text'])")
echo "$BODY" | grep -q "1 data-subject request(s) are due within 7 days" || { echo "FAIL: digest does not list the one request due soon"; echo "$BODY"; exit 1; }
echo "$BODY" | grep -q "  export  due " || { echo "FAIL: digest line"; exit 1; }
if echo "$BODY" | grep -q "@example.test"; then echo "FAIL: digest names a requester"; exit 1; fi
echo '{"ok":true,"audit_append_only":"enforced by the database role","digest_mail":"counts and ids only"}'
