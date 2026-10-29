#!/usr/bin/env bash
# Content editing E2E on a throwaway copy of the database: edit → autosave → submit → approve → worker rebuilds the search chunks →
# revision + diff → approve → old version's chunks are erased. Also proves the seed importer leaves edited drafts and published
# chunks alone. Web :3207. Needs the embedding service (embed-m3) up: the worker embeds the edited text.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
DC="docker compose --env-file .env -f deploy/docker-compose.dev.yml"
DB=legal_consult_cnt PORT=3207 TS=$(date +%s)
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER -q"
Q() { $PSQL -d "$DB" -t -A -c "$1"; }
OUT=web/test-results/content

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
(cd web && exec env DB_NAME=$DB BETTER_AUTH_URL=$ORIGIN APP_URL=$ORIGIN NODE_ENV=production KB_SERVE_DRAFTS=true EMAIL_VERIFICATION_REQUIRED=false AUTH_SIGNIN_RATE_MAX=200 \
  node node_modules/next/dist/bin/next start -p $PORT >test-results/content/web.log 2>&1) &
WEB_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null "$ORIGIN/login" && break; sleep 1; done

for who in editor reviewer member; do
  addr="content-e2e-$who-$TS@example.test"
  curl -sf -o /dev/null -X POST "$ORIGIN/api/auth/sign-up/email" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "{\"email\":\"$addr\",\"password\":\"correct-horse-9\",\"name\":\"$who\"}"
  Q "INSERT INTO app.user_consents (user_id, purpose, doc_version, granted)
     SELECT u.id, c.p::app.consent_purpose, c.v, true FROM app.users u,
       (VALUES ('service_terms','terms-2026-09'),('privacy_notice','privacy-2026-09')) c(p, v) WHERE u.email = '$addr'" >/dev/null
done
scripts/set-role.sh "content-e2e-editor-$TS@example.test" editor "$DB" >/dev/null
scripts/set-role.sh "content-e2e-reviewer-$TS@example.test" reviewer "$DB" >/dev/null

# an article that exists as a draft with chunks, and a draft glossary term
ARTICLE=$(Q "SELECT v.id FROM kb.article_versions v JOIN kb.articles a ON a.id = v.article_id WHERE v.status = 'draft' AND v.version_no = 1 ORDER BY a.id LIMIT 1")
SLUG=$(Q "SELECT a.slug FROM kb.article_versions v JOIN kb.articles a ON a.id = v.article_id WHERE v.id = $ARTICLE")
AID=$(Q "SELECT article_id FROM kb.article_versions WHERE id = $ARTICLE")
GLOSS=$(Q "SELECT id FROM kb.glossary_terms WHERE status = 'draft' ORDER BY id LIMIT 1")
printf '{"articleId":%s,"glossaryId":%s,"slug":"%s"}' "$ARTICLE" "$GLOSS" "$SLUG" > "$OUT/seed.json"
BEFORE=$(Q "SELECT count(*) FROM kb.chunks WHERE source_type = 'article' AND source_id = $AID")
echo "article $ARTICLE ($SLUG) has $BEFORE chunks before editing"

PW="docker run --rm --network host -u $(id -u):$(id -g) -e HOME=/tmp -v $PWD/web:/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble"
run() { $PW env BASE_URL="$ORIGIN" TS="$TS" PHASE="$1" OUT_DIR=test-results/content node tests/content-e2e.mjs; }
worker() {
  $DC run --rm -T -e DB_NAME=$DB worker python -c "
import psycopg
from psycopg.rows import dict_row
from app.core.config import get_settings
from worker.__main__ import run_once
with psycopg.connect(get_settings().db_conninfo, row_factory=dict_row) as c:
    n = 0
    while run_once(c):
        n += 1
print('jobs run:', n)
" 2>/dev/null | tail -1
}
run 1
[[ $(Q "SELECT count(*) FROM app.jobs WHERE type = 'ingest_content' AND status = 'queued'") -ge 1 ]] || { echo "FAIL: no ingest_content job was queued for the edited article"; exit 1; }
worker
[[ $(Q "SELECT count(*) FROM app.jobs WHERE type IN ('ingest_content','reindex') AND status = 'dead'") == 0 ]] || { echo "FAIL: a job died"; Q "SELECT type, last_error FROM app.jobs WHERE status = 'dead'"; exit 1; }
V1=$ARTICLE
[[ $(Q "SELECT count(*) FROM kb.chunks WHERE source_type = 'article' AND source_id = $AID AND source_version = $V1 AND content LIKE '%ข้อความรุ่นแรกที่แก้ในหลังบ้าน%'") == 1 ]] || { echo "FAIL: edited text is not in the chunks"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.chunks WHERE source_type = 'article' AND source_id = $AID AND source_version = $V1 AND NOT is_published") == 0 ]] || { echo "FAIL: published version has unpublished chunks"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.chunks WHERE source_type = 'article' AND source_id = $AID AND source_version = $V1 AND content LIKE '%[[%'") == 0 ]] || { echo "FAIL: raw [[refs]] left in chunk text"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.chunks WHERE source_type = 'article' AND source_id = $AID AND source_version = $V1 AND content LIKE '%ป.พ.พ. มาตรา 383%'") -ge 1 ]] || { echo "FAIL: the inserted reference was not rendered as readable text"; exit 1; }

run 2
worker
V2=$(node -e "console.log(require('./$OUT/v2.json').v2)")
[[ $(Q "SELECT count(*) FROM app.jobs WHERE type = 'ingest_content' AND status = 'done'") -ge 2 ]] || { echo "FAIL: ingest jobs"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.chunks WHERE source_type = 'article' AND source_id = $AID AND source_version = $V2 AND is_published AND content LIKE '%ข้อความรุ่นสองที่แก้ในหลังบ้าน%'") == 1 ]] || { echo "FAIL: v2 chunks missing or unpublished"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.chunks WHERE source_type = 'article' AND source_id = $AID AND source_version = $V1") == 0 ]] || { echo "FAIL: the archived version's chunks are still searchable"; exit 1; }
[[ $(Q "SELECT count(DISTINCT source_version) FROM kb.chunks WHERE source_type = 'article' AND source_id = $AID") == 1 ]] || { echo "FAIL: more than one version is searchable"; exit 1; }
run 3

# the seed importer must not undo this: edited draft glossary term stays, and the published version keeps its chunks
GLOSS_DEF=$(Q "SELECT short_def FROM kb.glossary_terms WHERE id = $GLOSS")
PUB_BEFORE=$(Q "SELECT count(*) FROM kb.chunks WHERE source_type = 'article' AND source_id = $AID AND source_version = $V2 AND is_published")
$DC run --rm -T -e DB_NAME=$DB -e DB_USER=lc_worker -e DB_PASSWORD="$DB_WORKER_PASSWORD" ai python -m app.cli seed-kb --path /kb > "$OUT/seed-kb.json" || true
[[ "$(Q "SELECT short_def FROM kb.glossary_terms WHERE id = $GLOSS")" == "$GLOSS_DEF" ]] || { echo "FAIL: the importer overwrote an edited glossary draft"; exit 1; }
[[ "$GLOSS_DEF" == "คำอธิบายที่แก้ในหลังบ้านเพื่อทดสอบ" ]] || { echo "FAIL: glossary edit missing"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.chunks WHERE source_type = 'article' AND source_id = $AID AND source_version = $V2 AND is_published") == "$PUB_BEFORE" ]] || { echo "FAIL: the importer changed the published version's chunks"; exit 1; }
[[ $(Q "SELECT status::text FROM kb.article_versions WHERE id = $V2") == "published" ]] || { echo "FAIL: importer changed a published version"; exit 1; }
echo '{"ok":true,"chunks_rebuilt_from_edits":true,"archived_version_erased_from_search":true,"importer_respects_edits_and_published":true}'
