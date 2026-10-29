#!/usr/bin/env bash
# Encrypted backup of everything that cannot be rebuilt: the database (custom-format dump + roles) and the object store
# (contract files, imported statute files). Output: $BACKUP_DIR/<UTC timestamp>/ with a MANIFEST.json of sha256 + row counts,
# which scripts/restore-test.sh checks. Retention: BACKUP_KEEP_DAILY newest + BACKUP_KEEP_WEEKLY (one per ISO week).
#
# NOT included, on purpose: .env and the APP_KEY_* encryption keys. Store those in a secret vault; without them the encrypted
# columns and files in this backup cannot be read (docs/03-technical-spec.md §7.13).
#
# Usage: scripts/backup.sh            (compose dev; set COMPOSE_FILE for production)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is empty}"
COMPOSE_FILE=${COMPOSE_FILE:-deploy/docker-compose.dev.yml}
DC="docker compose --env-file .env -f $COMPOSE_FILE"
BACKUP_DIR=${BACKUP_DIR:-./backups}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST="$BACKUP_DIR/$STAMP"
mkdir -p "$DEST"; chmod 700 "$BACKUP_DIR" "$DEST"
enc() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE; }
PSQL="$DC exec -T postgres psql -U $DB_ADMIN_USER -d $DB_NAME -t -A -c"

echo "== database"
$DC exec -T postgres pg_dump -U "$DB_ADMIN_USER" -d "$DB_NAME" -Fc | enc > "$DEST/db.dump.enc"
$DC exec -T postgres pg_dumpall -U "$DB_ADMIN_USER" --globals-only | enc > "$DEST/globals.sql.enc"

echo "== object store"
$DC exec -T minio tar czf - -C /bitnami/minio/data "$S3_BUCKET" | enc > "$DEST/objects.tgz.enc"
OBJECTS=$($DC exec -T minio sh -c "find /bitnami/minio/data/$S3_BUCKET -type f -name 'xl.meta' | wc -l" | tr -d '[:space:]')

echo "== manifest"
COUNTS=$(for t in app.users app.chats app.messages app.contracts app.audit_log kb.law_sections kb.article_versions kb.chunks; do printf '"%s": %s, ' "$t" "$($PSQL "SELECT count(*) FROM $t")"; done)
MIGR=$($PSQL "SELECT count(*) FROM public.schema_migrations" 2>/dev/null || echo 0)
{
  printf '{\n  "created_at": "%s",\n  "db": "%s",\n  "row_counts": {%s"_": 0},\n  "objects": %s,\n  "migrations_applied": %s,\n  "files": {\n' "$STAMP" "$DB_NAME" "$COUNTS" "${OBJECTS:-0}" "${MIGR:-0}"
  first=1
  for f in db.dump.enc globals.sql.enc objects.tgz.enc; do
    [[ $first == 1 ]] || printf ',\n'; first=0
    printf '    "%s": {"sha256": "%s", "bytes": %s}' "$f" "$(sha256sum "$DEST/$f" | cut -d' ' -f1)" "$(stat -c %s "$DEST/$f")"
  done
  printf '\n  }\n}\n'
} > "$DEST/MANIFEST.json"
chmod 600 "$DEST"/*

echo "== retention"
mapfile -t ALL < <(ls -1 "$BACKUP_DIR" | grep -E '^[0-9]{8}T[0-9]{6}Z$' | sort -r)
KEEP=()
for d in "${ALL[@]:0:${BACKUP_KEEP_DAILY:-14}}"; do KEEP+=("$d"); done
declare -A WEEK
for d in "${ALL[@]}"; do
  w=$(date -u -d "${d:0:4}-${d:4:2}-${d:6:2}" +%G-%V)
  [[ -n "${WEEK[$w]:-}" ]] || { WEEK[$w]=$d; }   # newest backup of each ISO week (list is newest-first)
done
i=0; for w in $(printf '%s\n' "${!WEEK[@]}" | sort -r); do (( i++ < ${BACKUP_KEEP_WEEKLY:-8} )) && KEEP+=("${WEEK[$w]}"); done
for d in "${ALL[@]}"; do
  [[ " ${KEEP[*]} " == *" $d "* ]] || { rm -rf "${BACKUP_DIR:?}/$d"; echo "pruned $d"; }
done
echo "backup ok: $DEST ($(du -sh "$DEST" | cut -f1))"
