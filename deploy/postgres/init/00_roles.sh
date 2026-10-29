#!/bin/bash
# Creates least-privilege runtime roles (docs/03-technical-spec.md §2.7.1).
# Runs once, on first start of an empty data directory.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE lc_web    LOGIN PASSWORD '${DB_WEB_PASSWORD}';
CREATE ROLE lc_ai     LOGIN PASSWORD '${DB_AI_PASSWORD}';
CREATE ROLE lc_worker LOGIN PASSWORD '${DB_WORKER_PASSWORD}';
CREATE ROLE lc_readonly NOLOGIN;
REVOKE ALL ON DATABASE "${POSTGRES_DB}" FROM PUBLIC;
GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO lc_web, lc_ai, lc_worker;
SQL
