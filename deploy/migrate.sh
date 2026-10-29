#!/bin/sh
# One-shot migration runner for the production compose stack: applies /migrations/*.sql in order, once each, with checksums
# (same rules as scripts/db-migrate.sh: forward-only, refuses to continue if an applied file was edited).
set -eu
export PGHOST=postgres PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE="$POSTGRES_DB"
PSQL="psql -v ON_ERROR_STOP=1 -q -t -A"
until pg_isready -q; do sleep 1; done
$PSQL -c "CREATE TABLE IF NOT EXISTS public.schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())" >/dev/null
for f in /migrations/[0-9][0-9][0-9][0-9]_*.sql; do
  v=$(basename "$f" .sql)
  sum=$(sha256sum "$f" | cut -d' ' -f1)
  applied=$($PSQL -c "SELECT checksum FROM public.schema_migrations WHERE version='$v'")
  if [ -n "$applied" ]; then
    [ "$applied" = "$sum" ] || { echo "ERROR: $v was modified after being applied"; exit 1; }
    continue
  fi
  echo "applying $v"
  if head -1 "$f" | grep -q -- '-- migrate:no-transaction'; then $PSQL -f "$f" >/dev/null; else $PSQL -1 -f "$f" >/dev/null; fi
  $PSQL -c "INSERT INTO public.schema_migrations(version, checksum) VALUES ('$v', '$sum')" >/dev/null
done
echo "migrations up to date"
