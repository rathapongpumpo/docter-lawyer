#!/usr/bin/env bash
# Grant a system role until the admin users page exists (docs/03-technical-spec.md §3.2.10 admin_update_user).
# Usage: scripts/set-role.sh <email> <member|editor|reviewer|admin> [database]
set -euo pipefail
cd "$(dirname "$0")/.."
[[ $# -ge 2 ]] || { echo "usage: $0 <email> <member|editor|reviewer|admin> [database]"; exit 2; }
email=$1 role=$2
[[ $role =~ ^(member|editor|reviewer|admin)$ ]] || { echo "unknown role: $role"; exit 2; }
set -a; source .env; set +a
db=${3:-$DB_NAME}
docker compose --env-file .env -f deploy/docker-compose.dev.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$DB_ADMIN_USER" -d "$db" -q -t -A -v email="$email" -v role="$role" <<'SQL'
WITH changed AS (
  UPDATE app.users SET role = :'role'::app.user_role, updated_at = now()
  WHERE lower(email) = lower(:'email') AND NOT is_anonymous RETURNING id
)
INSERT INTO app.audit_log (actor_role, action, target_type, target_id, meta)
SELECT 'operator', 'user.role_change', 'user', id::text, jsonb_build_object('role', :'role', 'via', 'scripts/set-role.sh')
FROM changed RETURNING target_id;
SQL
