#!/usr/bin/env bash
# Apply db/migrations/*.sql in order, once each, recording checksums in public.schema_migrations.
# Forward-only (docs/03-technical-spec.md §2.7). Refuses to continue if an applied file was edited.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
DC="docker compose --env-file .env -f deploy/docker-compose.dev.yml"
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER -d $DB_NAME -q -t -A"

$PSQL -c "CREATE TABLE IF NOT EXISTS public.schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())" >/dev/null

for f in db/migrations/[0-9][0-9][0-9][0-9]_*.sql; do
  v=$(basename "$f" .sql)
  sum=$(sha256sum "$f" | cut -d' ' -f1)
  applied=$($PSQL -c "SELECT checksum FROM public.schema_migrations WHERE version='$v'")
  if [[ -n "$applied" ]]; then
    [[ "$applied" == "$sum" ]] || { echo "ERROR: $v was modified after being applied (checksum mismatch)"; exit 1; }
    continue
  fi
  echo "applying $v"
  if head -1 "$f" | grep -q -- '-- migrate:no-transaction'; then
    $PSQL -f "/migrations/$(basename "$f")" >/dev/null
  else
    $PSQL -1 -f "/migrations/$(basename "$f")" >/dev/null
  fi
  $PSQL -c "INSERT INTO public.schema_migrations(version, checksum) VALUES ('$v', '$sum')" >/dev/null
done
echo "migrations up to date"
