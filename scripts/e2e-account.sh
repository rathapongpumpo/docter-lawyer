#!/usr/bin/env bash
# Account-flow E2E on a throwaway copy of the database (register, verify, reset, lockout, consent gate, 2FA, deletion).
# Web runs on :3202 against the copy; mail goes to the dev mailpit (recipients are unique acct-e2e-*@example.test).
# Needs a current `cd web && corepack pnpm run build` and the dev compose stack (postgres, mailpit) up.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
DC="docker compose --env-file .env -f deploy/docker-compose.dev.yml"
DB=legal_consult_acct PORT=3202
PSQL="$DC exec -T postgres psql -v ON_ERROR_STOP=1 -U $DB_ADMIN_USER -q"

cleanup() {
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  $PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" || true
}
trap cleanup EXIT

$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB OWNER $DB_ADMIN_USER"
$DC exec -T postgres sh -c "pg_dump -U $DB_ADMIN_USER $DB_NAME | psql -q -U $DB_ADMIN_USER -d $DB" >/dev/null
$PSQL -d "$DB" -c "GRANT CONNECT ON DATABASE $DB TO lc_web, lc_ai, lc_worker"

(cd web && exec env DB_NAME=$DB BETTER_AUTH_URL=http://localhost:$PORT APP_URL=http://localhost:$PORT NODE_ENV=production \
  EMAIL_VERIFICATION_REQUIRED=true MAIL_LIVE=true \
  node node_modules/next/dist/bin/next start -p $PORT >/dev/null 2>&1) &
WEB_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done

mkdir -p web/test-results/account
docker run --rm --network host -u "$(id -u):$(id -g)" -e HOME=/tmp -e BASE_URL="http://localhost:$PORT" \
  -e MAIL_API="http://127.0.0.1:58025" -v "$PWD/web":/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble \
  node tests/account-e2e.mjs

# "remember me" must not apply to staff (BR-017): a member's cookie persists, an editor's is a session cookie
ORIGIN="http://localhost:$PORT"
signin() { curl -s -i -X POST "$ORIGIN/api/auth/sign-in/email" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
  -d "{\"email\":\"$1\",\"password\":\"correct-horse-9\",\"rememberMe\":true}"; }
for who in member editor; do
  addr="acct-e2e-$who-$(date +%s)@example.test"
  curl -sf -o /dev/null -X POST "$ORIGIN/api/auth/sign-up/email" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
    -d "{\"email\":\"$addr\",\"password\":\"correct-horse-9\",\"name\":\"e2e $who\"}"
  $PSQL -d "$DB" -c "UPDATE app.users SET email_verified = true WHERE email = '$addr'"
  [[ $who == editor ]] && scripts/set-role.sh "$addr" editor "$DB" >/dev/null
  cookie=$(signin "$addr" | grep -i '^set-cookie: lc.session_token' | head -1)
  if [[ $who == member ]]; then echo "$cookie" | grep -qi 'max-age' || { echo "FAIL: member remember-me cookie has no Max-Age"; exit 1; }
  else echo "$cookie" | grep -qi 'max-age' && { echo "FAIL: staff cookie must be a session cookie: $cookie"; exit 1; }; fi
done
echo '{"ok":true,"staff_no_remember_me":true}'
