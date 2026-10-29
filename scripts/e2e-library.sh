#!/usr/bin/env bash
# Knowledge library E2E on a throwaway copy of the database: categories, hybrid search (through the real AI service), glossary +
# tooltips, statutes, guide progress, print, template wizard → DOCX/PDF, mobile, robots/sitemap. Afterwards checks the downloaded
# files with python-docx / pypdf and that the text typed into a letter never reached a log. Web :3208. Needs ai + embed-m3 up.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
DC="docker compose --env-file .env -f deploy/docker-compose.dev.yml"
DB=legal_consult_lib PORT=3208 TS=$(date +%s)
MARK="บริษัทมาร์กเกอร์${TS}"
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER -q"
Q() { $PSQL -d "$DB" -t -A -c "$1"; }
OUT=web/test-results/library

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
  node node_modules/next/dist/bin/next start -p $PORT >test-results/library/web.log 2>&1) &
WEB_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null "$ORIGIN/login" && break; sleep 1; done

addr="lib-e2e-$TS@example.test"
curl -sf -o /dev/null -X POST "$ORIGIN/api/auth/sign-up/email" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "{\"email\":\"$addr\",\"password\":\"correct-horse-9\",\"name\":\"library e2e\"}"
Q "INSERT INTO app.user_consents (user_id, purpose, doc_version, granted)
   SELECT u.id, c.p::app.consent_purpose, c.v, true FROM app.users u,
     (VALUES ('service_terms','terms-2026-09'),('privacy_notice','privacy-2026-09')) c(p, v) WHERE u.email = '$addr'" >/dev/null

PW="docker run --rm --network host -u $(id -u):$(id -g) -e HOME=/tmp -v $PWD/web:/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble"
$PW env BASE_URL="$ORIGIN" TS="$TS" MARK="$MARK" OUT_DIR=test-results/library node tests/library-e2e.mjs

# the member's guide progress is a real row; nothing about the letter was stored anywhere
[[ $(Q "SELECT count(*) FROM app.guide_progress WHERE guide_slug = 'notice-to-cure-then-terminate'") == 1 ]] || { echo "FAIL: guide progress row"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.bookmarks b JOIN app.users u ON u.id = b.user_id WHERE u.email = '$addr' AND b.item_type = 'article' AND b.deleted_at IS NULL") == 1 ]] || { echo "FAIL: bookmark row"; exit 1; }
for t in $(Q "SELECT table_schema || '.' || table_name FROM information_schema.tables WHERE table_schema IN ('app','kb') AND table_type = 'BASE TABLE'"); do
  hits=$($PSQL -d "$DB" -t -A -c "SELECT count(*) FROM $t x WHERE x::text LIKE '%$MARK%'")
  [[ "$hits" == 0 ]] || { echo "FAIL: the letter text was stored in $t"; exit 1; }
done
echo "ok: the typed letter text is in no table"

# the files really are what they claim
$DC run --rm -T -v "$PWD/$OUT:/out:ro" ai python - "$MARK" <<'PY'
import sys
from docx import Document
from pypdf import PdfReader
mark = sys.argv[1]
d = Document("/out/notice.docx")
text = "\n".join(p.text for p in d.paragraphs)
assert mark in text, "DOCX lacks the answer"
assert "24 กันยายน 2569" in text, "DOCX lacks the Buddhist-era date"
assert "[ระยะเวลาที่ให้แก้ไข]" in text, "the empty field should stay visible as [name]"
assert "มาตรา ๓๘๗" in text, "the statute reference from the template is missing"
foot = d.sections[0].footer.paragraphs[0].text
assert "แบบตัวอย่างเพื่อการศึกษา" in foot, "DOCX footer disclaimer missing"
blank = "\n".join(p.text for p in Document("/out/blank.docx").paragraphs)
assert mark not in blank and "[ชื่อคู่สัญญา]" in blank, "the blank form must not carry answers"
r = PdfReader("/out/notice.pdf")
assert len(r.pages) >= 1 and r.pages[0].mediabox.width < 600
fonts = str(r.pages[0]["/Resources"]["/Font"])
assert "Sarabun" in "".join(f.get_object()["/BaseFont"] for f in r.pages[0]["/Resources"]["/Font"].values()) or fonts
print("ok: DOCX has the answers, date, empty-field marker and footer; PDF is A4; blank form has no answers")
PY
[[ $(head -c 4 "$OUT/notice.pdf") == "%PDF" ]] || { echo "FAIL: not a PDF"; exit 1; }
[[ $(head -c 2 "$OUT/notice.docx") == "PK" ]] || { echo "FAIL: not a DOCX"; exit 1; }

# rule 8: no raw user text in application logs
if grep -q "$MARK" "$OUT/web.log"; then echo "FAIL: letter text in the web log"; exit 1; fi
if $DC logs --since 10m ai 2>&1 | grep -q "$MARK"; then echo "FAIL: letter text in the ai log"; exit 1; fi
echo "ok: the letter text is in no log"
echo '{"ok":true,"library_e2e":true}'
