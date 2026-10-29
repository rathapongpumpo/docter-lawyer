#!/usr/bin/env bash
# Statute import E2E on a throwaway database copy: PDF laid out like a gazette file → parse job (accuracy against the knowledge base's own
# statute text) → edit/leave out rows → draft version + chunks → review → the earlier version is closed, citing content flagged for review.
# Web :3208. Needs minio and embed-m3.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
DC="docker compose --env-file .env -f deploy/docker-compose.dev.yml"
DB=legal_consult_law PORT=3208 TS=$(date +%s)
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER -q"
Q() { $PSQL -d "$DB" -t -A -c "$1"; }
OUT=web/test-results/law
IMG=legal-consult-dev-ai:latest

cleanup() {
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  $PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" || true
}
trap cleanup EXIT

curl -sf -o /dev/null "$S3_ENDPOINT/minio/health/live" || { echo "MinIO is not up"; exit 1; }
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB OWNER $DB_ADMIN_USER"
$DC exec -T postgres sh -c "pg_dump -U $DB_ADMIN_USER $DB_NAME | psql -q -U $DB_ADMIN_USER -d $DB" >/dev/null
$PSQL -d "$DB" -c "GRANT CONNECT ON DATABASE $DB TO lc_web, lc_ai, lc_worker"
rm -rf "$OUT"; mkdir -p "$OUT"
ORIGIN="http://localhost:$PORT"
(cd web && exec env DB_NAME=$DB BETTER_AUTH_URL=$ORIGIN APP_URL=$ORIGIN NODE_ENV=production EMAIL_VERIFICATION_REQUIRED=false AUTH_SIGNIN_RATE_MAX=200 \
  node node_modules/next/dist/bin/next start -p $PORT >test-results/law/web.log 2>&1) &
WEB_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null "$ORIGIN/login" && break; sleep 1; done
for who in editor reviewer; do
  addr="law-e2e-$who-$TS@example.test"
  curl -sf -o /dev/null -X POST "$ORIGIN/api/auth/sign-up/email" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "{\"email\":\"$addr\",\"password\":\"correct-horse-9\",\"name\":\"$who\"}"
  Q "INSERT INTO app.user_consents (user_id, purpose, doc_version, granted)
     SELECT u.id, c.p::app.consent_purpose, c.v, true FROM app.users u,
       (VALUES ('service_terms','terms-2026-09'),('privacy_notice','privacy-2026-09')) c(p, v) WHERE u.email = '$addr'" >/dev/null
  scripts/set-role.sh "$addr" "$who" "$DB" >/dev/null
done

# ground truth: the sections of the "ccc" statute files in the knowledge base, set in the PDF with Thai digits and gazette furniture
docker run -i --rm -u "$(id -u):$(id -g)" -v "$PWD/ai":/w -v "$PWD/docs/knowledge-base":/kb:ro -v "$PWD/$OUT":/o -w /w "$IMG" python - <<'PY'
import json, re
from pathlib import Path
from app.kb.source_files import parse_law_file
from app.kb.thai import section_sort_key
KB = Path("/kb")
secs = {}
for f in sorted((KB / "laws").glob("*.md")):
    lf = parse_law_file(f, KB)
    if lf.meta["law"] == "ccc":
        for s in lf.sections:
            secs[s.section_no] = s.body
order = sorted(secs, key=section_sort_key)
th = str.maketrans("0123456789", "๐๑๒๓๔๕๖๗๘๙")
json.dump([{"no": n.translate(th), "body": secs[n]} for n in order], open("/o/sections.json", "w"), ensure_ascii=False)
json.dump({n: secs[n] for n in order}, open("/o/truth.json", "w"), ensure_ascii=False)
print(len(order), "sections")
PY
PW="docker run --rm --network host -u $(id -u):$(id -g) -e HOME=/tmp -v $PWD/web:/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble"
$PW env FIXTURE_DIR=test-results/law node tests/law-fixtures.mjs
run() { $PW env BASE_URL="$ORIGIN" TS="$TS" PHASE="$1" OUT_DIR=test-results/law node tests/law-e2e.mjs; }
worker() {
  $DC run --rm -T -e DB_NAME=$DB -e S3_ENDPOINT=http://minio:9000 worker python -c "
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
N=$(node -e "console.log(require('./$OUT/sections.json').length)")

run 1
worker
PARSE=$(Q "SELECT id FROM app.jobs WHERE type = 'ingest_law' AND payload->>'step' = 'parse' AND status = 'done' ORDER BY id LIMIT 1")
[[ -n "$PARSE" ]] || { echo "FAIL: no finished parse job"; Q "SELECT id, status, last_error FROM app.jobs WHERE type = 'ingest_law'"; exit 1; }
# accuracy against the ground truth (FR-ADM-008 AC1: ≥ 99 %)
Q "SELECT result::text FROM app.jobs WHERE id = $PARSE" > "$OUT/parse-result.json"
docker run -i --rm -u "$(id -u):$(id -g)" -v "$PWD/$OUT":/o "$IMG" python - <<'PY'
import json, re
res = json.load(open("/o/parse-result.json"))
truth = json.load(open("/o/truth.json"))
got = {s["no"]: s["body"] for s in res["sections"]}
norm = lambda s: re.sub(r"\s+", "", s)
found = sum(1 for n in truth if n in got)
exact = sum(1 for n, b in truth.items() if n in got and norm(got[n]) == norm(b))
extra = [n for n in got if n not in truth]
print(json.dumps({"truth": len(truth), "found": found, "identical_text": exact, "extra": extra}))
assert found / len(truth) >= 0.99, "sections found below 99%"
assert exact / len(truth) >= 0.99, "identical text below 99%"
assert not extra, "sections that are not in the statute"
PY
OLD=$(Q "SELECT v.id FROM kb.law_versions v JOIN kb.laws l ON l.id = v.law_id WHERE l.law_code = 'ccc' AND v.status = 'draft' ORDER BY v.id LIMIT 1")
printf '{"parseJob":%s,"expectN":%s,"oldVersion":%s,"newVersion":0,"articleSlug":""}' "$PARSE" "$N" "$OLD" > "$OUT/seed.json"
run 2
worker
NEW=$(Q "SELECT id FROM kb.law_versions WHERE version_label = 'ทดสอบอัปโหลดจาก PDF'")
[[ -n "$NEW" ]] || { echo "FAIL: draft version was not created"; Q "SELECT id, status, result::text, last_error FROM app.jobs WHERE payload->>'step' = 'commit'"; exit 1; }
[[ $(Q "SELECT status::text FROM kb.law_versions WHERE id = $NEW") == "draft" ]] || { echo "FAIL: the uploaded version must be a draft"; exit 1; }
[[ $(Q "SELECT effective_from IS NULL FROM kb.law_versions WHERE id = $NEW") == "t" ]] || { echo "FAIL: effective date must not be guessed"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.law_sections WHERE law_version_id = $NEW") == $((N - 1)) ]] || { echo "FAIL: expected $((N - 1)) sections (one left out)"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.law_sections WHERE law_version_id = $NEW AND body LIKE '%(แก้ในตาราง)'") == 1 ]] || { echo "FAIL: the edit in the table was not saved"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.chunks WHERE source_type = 'law_section' AND source_version = $NEW AND NOT is_published") == $((N - 1)) ]] || { echo "FAIL: chunks of the draft"; exit 1; }
[[ $(Q "SELECT source_sha256 IS NOT NULL AND source_file_path LIKE 'lc-private/kb/imports/%' FROM kb.law_versions WHERE id = $NEW") == "t" ]] || { echo "FAIL: source provenance"; exit 1; }
printf '{"parseJob":%s,"expectN":%s,"oldVersion":%s,"newVersion":%s,"articleSlug":""}' "$PARSE" "$N" "$OLD" "$NEW" > "$OUT/seed.json"

# an article that cites a section the upload will change: the edited one
FIRST=$(node -e "console.log(require('./$OUT/commit.json').first)")
FIRST_ARABIC=$(python3 -c "print('$FIRST'.translate(str.maketrans('๐๑๒๓๔๕๖๗๘๙','0123456789')))")
Q "UPDATE kb.article_versions SET sources = sources || '[{\"kind\":\"law_section\",\"law_code\":\"ccc\",\"section_no\":\"$FIRST_ARABIC\"}]'::jsonb WHERE id = (SELECT id FROM kb.article_versions ORDER BY id LIMIT 1)" >/dev/null
ART=$(Q "SELECT article_id FROM kb.article_versions ORDER BY id LIMIT 1")
Q "UPDATE kb.article_versions SET status = 'published' WHERE article_id = $ART" >/dev/null
Q "UPDATE kb.articles SET review_due_at = NULL WHERE id = $ART" >/dev/null
run 3
worker
[[ $(Q "SELECT status::text || ' ' || effective_to::text FROM kb.law_versions WHERE id = $OLD") == "published 2025-12-31" ]] || { echo "FAIL: the earlier version was not closed"; Q "SELECT id,status,effective_from,effective_to FROM kb.law_versions"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.law_sections WHERE law_version_id = $OLD AND effective_to IS DISTINCT FROM DATE '2025-12-31'") == 0 ]] || { echo "FAIL: earlier sections not closed"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.law_sections WHERE law_version_id = $OLD") -ge 1 ]] || { echo "FAIL: earlier version's sections were deleted"; exit 1; }
[[ $(Q "SELECT status::text || ' ' || effective_from::text FROM kb.law_versions WHERE id = $NEW") == "published 2026-01-01" ]] || { echo "FAIL: new version not published"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.chunks c JOIN kb.law_sections s ON s.id = c.source_id WHERE c.source_type = 'law_section' AND s.law_version_id = $OLD AND c.effective_to IS DISTINCT FROM DATE '2025-12-31'") == 0 ]] || { echo "FAIL: search chunks of the earlier version still open-ended"; exit 1; }
[[ $(Q "SELECT count(*) FROM kb.chunks WHERE source_type = 'law_section' AND source_version = $NEW AND is_published AND effective_from = DATE '2026-01-01'") == $((N - 1)) ]] || { echo "FAIL: new chunks not published with their date"; exit 1; }
[[ $(Q "SELECT review_due_at::text FROM kb.articles WHERE id = $ART") == "$(date +%F)" ]] || { echo "FAIL: the article that cites a changed section was not put back on the review list"; exit 1; }
echo '{"ok":true,"parser_accuracy":"≥99% on the knowledge-base statutes","draft_only_until_reviewed":true,"earlier_version_closed_not_deleted":true,"citing_content_flagged":true}'
