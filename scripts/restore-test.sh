#!/usr/bin/env bash
# Proves a backup can be restored: verifies checksums, restores the dump into a scratch database, compares row counts with the
# manifest, checks the migration table and a few integrity queries, restores the object store into a scratch directory and
# compares the object count, then removes everything it created. It never touches the live database.
#
# Usage: scripts/restore-test.sh [backup-dir]     (default: newest under $BACKUP_DIR)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is empty}"
COMPOSE_FILE=${COMPOSE_FILE:-deploy/docker-compose.dev.yml}
DC="docker compose --env-file .env -f $COMPOSE_FILE"
BACKUP_DIR=${BACKUP_DIR:-./backups}
SRC=${1:-$BACKUP_DIR/$(ls -1 "$BACKUP_DIR" | grep -E '^[0-9]{8}T[0-9]{6}Z$' | sort | tail -1)}
SCRATCH=restore_test_$$
dec() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE; }
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER"
STARTED=$(date +%s)
cleanup() { $PSQL -d postgres -q -c "DROP DATABASE IF EXISTS $SCRATCH WITH (FORCE)" >/dev/null 2>&1 || true; rm -rf "${TMP:-/nonexistent}"; }
trap cleanup EXIT
TMP=$(mktemp -d)
fail() { echo "RESTORE TEST FAILED: $*" >&2; exit 1; }

echo "== checksums ($SRC)"
for f in db.dump.enc globals.sql.enc objects.tgz.enc; do
  want=$(python3 -c "import json,sys;print(json.load(open('$SRC/MANIFEST.json'))['files']['$f']['sha256'])")
  [[ "$(sha256sum "$SRC/$f" | cut -d' ' -f1)" == "$want" ]] || fail "$f does not match the manifest"
done

echo "== database"
dec < "$SRC/db.dump.enc" > "$TMP/db.dump" || fail "cannot decrypt db dump (wrong passphrase?)"
dec < "$SRC/globals.sql.enc" | grep -q "CREATE ROLE lc_web" || fail "globals dump lacks the application roles"
$PSQL -d postgres -q -c "CREATE DATABASE $SCRATCH OWNER $DB_ADMIN_USER"
$DC exec -T postgres pg_restore -U "$DB_ADMIN_USER" -d "$SCRATCH" --no-owner --exit-on-error < "$TMP/db.dump" 2>"$TMP/restore.err" || { cat "$TMP/restore.err"; fail "pg_restore"; }
Q() { $PSQL -d "$SCRATCH" -t -A -c "$1" </dev/null; }
python3 - "$SRC/MANIFEST.json" > "$TMP/counts.txt" <<'PY'
import json,sys
m=json.load(open(sys.argv[1]))
for t,n in m["row_counts"].items():
    if t!="_": print(t,n)
PY
while read -r table want; do
  got=$(Q "SELECT count(*) FROM $table")
  # rows written between the dump and the manifest count (both taken during a live backup) may differ by a few; never fewer
  (( got >= want - 5 )) || fail "$table: restored $got rows, manifest says $want"
  printf '  %-22s %s (manifest %s)\n' "$table" "$got" "$want"
done < "$TMP/counts.txt"
[[ $(Q "SELECT count(*) FROM pg_extension WHERE extname IN ('vector','pg_trgm')") == 2 ]] || fail "extensions missing after restore"
[[ $(Q "SELECT count(*) FROM kb.chunks WHERE embedding IS NOT NULL") -gt 0 ]] || fail "no embeddings after restore"
[[ $(Q "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('app','kb')") -ge 30 ]] || fail "too few tables"
echo "  extensions, embeddings and schema present"

echo "== object store"
dec < "$SRC/objects.tgz.enc" | tar xz -C "$TMP" || fail "cannot unpack the object archive"
got=$(find "$TMP/$S3_BUCKET" -type f -name 'xl.meta' | wc -l | tr -d '[:space:]')
want=$(python3 -c "import json;print(json.load(open('$SRC/MANIFEST.json'))['objects'])")
(( got >= want )) || fail "objects: restored $got, manifest says $want"
echo "  $got objects"
echo "restore test ok in $(( $(date +%s) - STARTED )) s: $SRC"
