#!/usr/bin/env bash
# Contract pipeline E2E on a throwaway copy of the database (M12 phase 1): upload checks, ClamAV (EICAR), encrypted object in MinIO,
# worker extraction, clauses, visibility, tenant isolation, deletion + purge, retention, organization erase,
# and the contract review with the MOCK backend (start → worker → results on the page → reviews erased with the contract).
# Web :3205. Needs `cd web && corepack pnpm run build`, and the dev stack incl. minio + clamav (ClamAV needs ~1 minute after start).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
DC="docker compose --env-file .env -f deploy/docker-compose.dev.yml"
DB=legal_consult_ct PORT=3205 TS=$(date +%s)
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER -q"
Q() { $PSQL -d "$DB" -t -A -c "$1"; }
IMG=legal-consult-dev-ai:latest
OUT=web/test-results/contracts

cleanup() {
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  $PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" || true
}
trap cleanup EXIT

# ClamAV must be answering (it loads ~3M signatures on start)
for _ in $(seq 1 90); do [[ "$(printf 'zPING\0' | timeout 3 nc 127.0.0.1 "$CLAMAV_PORT" 2>/dev/null | tr -d '\0')" == "PONG" ]] && break; sleep 2; done
[[ "$(printf 'zPING\0' | timeout 3 nc 127.0.0.1 "$CLAMAV_PORT" | tr -d '\0')" == "PONG" ]] || { echo "ClamAV is not ready"; exit 1; }
curl -sf -o /dev/null "$S3_ENDPOINT/minio/health/live" || { echo "MinIO is not up"; exit 1; }

$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB OWNER $DB_ADMIN_USER"
$DC exec -T postgres sh -c "pg_dump -U $DB_ADMIN_USER $DB_NAME | psql -q -U $DB_ADMIN_USER -d $DB" >/dev/null
$PSQL -d "$DB" -c "GRANT CONNECT ON DATABASE $DB TO lc_web, lc_ai, lc_worker"
JOB_BASE=$(Q "SELECT coalesce(max(id), 0) FROM app.jobs")   # jobs copied from the live database do not count

rm -rf "$OUT"; mkdir -p "$OUT/fixtures"
ORIGIN="http://localhost:$PORT"
(cd web && exec env DB_NAME=$DB BETTER_AUTH_URL=$ORIGIN APP_URL=$ORIGIN NODE_ENV=production EMAIL_VERIFICATION_REQUIRED=false AUTH_SIGNIN_RATE_MAX=200 RATE_UPLOAD_PER_MIN=1000 RATE_REVIEW_PER_MIN=1000 CONTRACT_REVIEW_BACKEND=mock \
  node node_modules/next/dist/bin/next start -p $PORT >test-results/contracts/web.log 2>&1) &
WEB_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null "$ORIGIN/login" && break; sleep 1; done

PW="docker run --rm --network host -u $(id -u):$(id -g) -e HOME=/tmp -v $PWD/web:/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble"
$PW env FIXTURE_DIR=test-results/contracts/fixtures node tests/contract-fixtures.mjs
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD/$OUT/fixtures":/f -v "$PWD/scripts":/s:ro "$IMG" python /s/make-contract-fixtures.py /f

for who in alice bob carol dave erin; do
  addr="contract-e2e-$who-$TS@example.test"
  curl -sf -o /dev/null -X POST "$ORIGIN/api/auth/sign-up/email" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
    -d "{\"email\":\"$addr\",\"password\":\"correct-horse-9\",\"name\":\"$who\"}"
  Q "INSERT INTO app.user_consents (user_id, purpose, doc_version, granted)
     SELECT u.id, c.p::app.consent_purpose, c.v, true FROM app.users u,
       (VALUES ('service_terms','terms-2026-09'),('privacy_notice','privacy-2026-09')) c(p, v) WHERE u.email = '$addr'" >/dev/null
done

run() { $PW env BASE_URL="$ORIGIN" TS="$TS" PHASE="$1" OUT_DIR=test-results/contracts node tests/contract-e2e.mjs; }
worker() { # run every queued job once (the compose worker serves the real database, not this copy)
  $DC run --rm -T -e DB_NAME=$DB -e S3_ENDPOINT=http://minio:9000 -e CONTRACT_REVIEW_BACKEND=mock worker python -c "
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
s3() { # s3 <python expression using client()/bucket()>
  docker run --rm --network host -u "$(id -u):$(id -g)" -v "$PWD/ai":/srv/ai:ro -e S3_ENDPOINT="$S3_ENDPOINT" -e S3_ACCESS_KEY="$S3_ACCESS_KEY" -e S3_SECRET_KEY="$S3_SECRET_KEY" -e S3_BUCKET="$S3_BUCKET" \
    "$IMG" python -c "from app.core.storage import client, bucket; $1"
}

run 1
ORG_A=$(node -e "console.log(require('./$OUT/state.json').orgA)")
ORG_B=$(node -e "console.log(require('./$OUT/state.json').orgB)")
uid() { Q "SELECT id FROM app.users WHERE email = 'contract-e2e-$1-$TS@example.test'"; }
Q "INSERT INTO app.members (organization_id, user_id, role) VALUES ('$ORG_A', $(uid bob), 'org_member'), ('$ORG_A', $(uid carol), 'org_admin')" >/dev/null
run 2

# the files are stored encrypted: neither the object nor the columns contain the plaintext
COUNT=$(s3 "print(len(list(client().list_objects(bucket(), prefix='org/$ORG_A/contracts/', recursive=True))))")
[[ "$COUNT" == "3" ]] || { echo "FAIL: expected 3 objects for org A, found $COUNT"; exit 1; }
[[ "$(s3 "print(len(list(client().list_objects(bucket(), prefix='org/$ORG_B/', recursive=True))))")" == "0" ]] || { echo "FAIL: org B has objects"; exit 1; }
PLAIN=$(s3 "
o = next(client().list_objects(bucket(), prefix='org/$ORG_A/contracts/', recursive=True))
r = client().get_object(bucket(), o.object_name); b = r.read()
print('PLAINTEXT' if (b[:5] == b'%PDF-' or b'PK\x03\x04' in b[:8] or 'ข้อ'.encode() in b) else ('ok' if b[0] == 1 and b[1] == 0 else 'BADHEADER'))")
[[ "$PLAIN" == "ok" ]] || { echo "FAIL: stored object is not an encrypted blob ($PLAIN)"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.contracts WHERE position(convert_to('contract', 'UTF8') in file_name_enc) > 0 OR position(convert_to('ข้อ', 'UTF8') in coalesce(text_enc, ''::bytea)) > 0") == 0 ]] || { echo "FAIL: file name or text stored in clear"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.audit_log WHERE action = 'org.contract_rejected_virus' AND meta->>'org_id' = '$ORG_A'") == 1 ]] || { echo "FAIL: virus rejection not audited"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.audit_log WHERE action = 'org.contract_uploaded' AND meta->>'org_id' = '$ORG_A'") == 3 ]] || { echo "FAIL: uploads not audited"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.contracts WHERE av_status <> 'clean'") == 0 ]] || { echo "FAIL: av_status"; exit 1; }

worker
# review (mock backend): start in the page/API, let the worker run the jobs, read the results; the stored result is encrypted
run R1
worker
run R2
[[ $(Q "SELECT count(*) FROM app.contract_reviews WHERE status = 'completed' AND backend = 'mock' AND org_id = '$ORG_A'") == 2 ]] || { echo "FAIL: expected 2 completed mock reviews"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.contract_reviews WHERE position(convert_to('ค่าปรับ', 'UTF8') in coalesce(findings_enc, ''::bytea) || coalesce(summary_enc, ''::bytea)) > 0") == 0 ]] || { echo "FAIL: review result stored in clear"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.audit_log WHERE action = 'org.contract_review_started' AND meta->>'org_id' = '$ORG_A'") == 2 ]] || { echo "FAIL: review starts not audited"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.jobs WHERE type = 'review_contract' AND status = 'done'") == 2 ]] || { echo "FAIL: review jobs"; exit 1; }
DOCX_ID=$(node -e "console.log(require('./$OUT/ids.json')['contract.docx'])")
run 3

# deletion: the worker erases the object and the row of what users deleted; the audit keeps only ids
worker
[[ "$(s3 "print(len(list(client().list_objects(bucket(), prefix='org/$ORG_A/contracts/', recursive=True))))")" == "1" ]] || { echo "FAIL: deleted contracts are still in storage"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.contracts WHERE org_id = '$ORG_A'") == 1 ]] || { echo "FAIL: rows of deleted contracts remain"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.contract_reviews WHERE contract_id = '$DOCX_ID'") == 0 ]] || { echo "FAIL: the review of a deleted contract was not erased"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.contract_reviews WHERE org_id = '$ORG_A'") == 1 ]] || { echo "FAIL: the kept contract lost its review"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.audit_log WHERE action = 'org.contract_purged' AND meta->>'reason' = 'deleted' AND meta->>'org_id' = '$ORG_A'") == 2 ]] || { echo "FAIL: purge not audited"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.jobs WHERE type = 'extract_contract' AND status = 'done' AND id > $JOB_BASE") == 3 ]] || { echo "FAIL: extraction jobs"; exit 1; }

# retention: a contract past its retention date is erased even though nobody deleted it
Q "UPDATE app.contracts SET retention_until = now() - interval '1 hour' WHERE org_id = '$ORG_A'" >/dev/null
Q "INSERT INTO app.jobs (type) VALUES ('purge_contracts')" >/dev/null   # (the hourly schedule is the worker's own loop)
worker
[[ $(Q "SELECT count(*) FROM app.contracts WHERE org_id = '$ORG_A'") == 0 ]] || { echo "FAIL: retention purge"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.contract_reviews WHERE org_id = '$ORG_A'") == 0 ]] || { echo "FAIL: retention purge left reviews"; exit 1; }
[[ "$(s3 "print(len(list(client().list_objects(bucket(), prefix='org/$ORG_A/contracts/', recursive=True))))")" == "0" ]] || { echo "FAIL: retention left objects"; exit 1; }


# erasing an organization removes its stored files as well
run 4
[[ "$(s3 "print(len(list(client().list_objects(bucket(), prefix='org/$ORG_A/contracts/', recursive=True))))")" == "1" ]] || { echo "FAIL: phase 4 object missing"; exit 1; }
Q "UPDATE app.organizations SET deletion_scheduled_at = now() - interval '1 day' WHERE id = '$ORG_A'" >/dev/null
Q "INSERT INTO app.jobs (type) VALUES ('purge_deleted_orgs')" >/dev/null
worker
[[ $(Q "SELECT count(*) FROM app.organizations WHERE id = '$ORG_A'") == 0 ]] || { echo "FAIL: organization not erased"; exit 1; }
[[ "$(s3 "print(len(list(client().list_objects(bucket(), prefix='org/$ORG_A/', recursive=True))))")" == "0" ]] || { echo "FAIL: organization erase left files in storage"; exit 1; }
[[ $(Q "SELECT count(*) FROM app.audit_log WHERE action = 'org.purged' AND meta->>'org_id' = '$ORG_A' AND (meta->>'contracts')::int = 1") == 1 ]] || { echo "FAIL: org purge count"; exit 1; }
echo '{"ok":true,"encrypted_at_rest":true,"virus_rejected_and_audited":true,"purge":"deleted+retention+organization","extraction_jobs":3,"review":"mock: start, worker, results, erased with the contract"}'
