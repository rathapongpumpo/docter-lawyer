#!/usr/bin/env bash
# Rehearsal of the production topology on this machine: the real web Docker image (web/Dockerfile) behind Caddy with TLS
# (deploy/Caddyfile, internal CA on https://localhost:8443), joined to the dev services (postgres/redis/ai) instead of a second full stack.
# Checks headers, secure cookies, closed internal endpoints, compression and SSE streaming through the proxy, then removes its containers.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
NET=legal-consult-dev_default
PORT=8443
cleanup() { docker rm -f lc-rehearsal-web lc-rehearsal-caddy >/dev/null 2>&1 || true; }
[[ -n "${KEEP:-}" ]] || trap cleanup EXIT; cleanup
mkdir -p web/test-results/prod

# `docker run --env-file` keeps inline comments and quotes that Compose strips: write the cleaned file the way Compose reads it
CLEAN=$(mktemp); if [[ -n "${KEEP:-}" ]]; then trap 'rm -f "$CLEAN"' EXIT; else trap 'rm -f "$CLEAN"; cleanup' EXIT; fi
python3 - "$CLEAN" <<'PY'
import re, sys
out = []
for line in open(".env"):
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line.rstrip("\n"))
    if not m:
        continue
    k, v = m.groups()
    v = v.strip()
    if v[:1] in "\"'" and v[-1:] == v[:1] and len(v) > 1:
        v = v[1:-1]
    else:
        v = re.sub(r"\s+#.*$", "", v)
    out.append(f"{k}={v}")
open(sys.argv[1], "w").write("\n".join(out) + "\n")
PY
docker build -q -t legal-consult-web:rehearsal --build-arg APP_BUILD=rehearsal web >/dev/null
docker run -d --name lc-rehearsal-web --network $NET --network-alias web --env-file "$CLEAN" \
  -e APP_ENV=prod -e NODE_ENV=production -e DB_HOST=postgres -e DB_PORT=5432 -e DB_USER=lc_web -e DB_PASSWORD="$DB_WEB_PASSWORD" \
  -e REDIS_URL="redis://:${REDIS_PASSWORD}@redis:6379/0" -e AI_SERVICE_URL=http://ai:8000 -e S3_ENDPOINT=http://minio:9000 \
  -e CLAMAV_HOST=clamav -e CLAMAV_PORT=3310 -e APP_URL=https://localhost:$PORT -e BETTER_AUTH_URL=https://localhost:$PORT \
  -e EXTRA_TRUSTED_ORIGINS= -e KB_SERVE_DRAFTS=false -e EMAIL_VERIFICATION_REQUIRED=false -e STAFF_2FA_REQUIRED=true -e METRICS_TOKEN=rehearsal-token \
  legal-consult-web:rehearsal >/dev/null
docker run -d --name lc-rehearsal-caddy --network $NET -p $PORT:$PORT -e SITE_ADDRESS=localhost:$PORT -e ACME_EMAIL=rehearsal@example.com \
  -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2 >/dev/null
for _ in $(seq 1 40); do [[ "$(docker inspect -f '{{.State.Health.Status}}' lc-rehearsal-web 2>/dev/null)" == healthy ]] && break; sleep 1; done
echo "web container health: $(docker inspect -f '{{.State.Health.Status}}' lc-rehearsal-web)"
for _ in $(seq 1 30); do [[ "$(curl -sk -o /dev/null -w '%{http_code}' https://localhost:$PORT/login)" == 200 ]] && break; sleep 1; done   # Caddy needs a moment to issue its local certificate
# metrics need the token, directly on the internal network
docker exec lc-rehearsal-web node -e "
fetch('http://127.0.0.1:3000/api/metrics').then(r=>console.log('metrics without token:', r.status));
fetch('http://127.0.0.1:3000/api/metrics',{headers:{authorization:'Bearer rehearsal-token'}}).then(async r=>{const t=await r.text();console.log('metrics with token:', r.status, t.includes('lc_web_api_requests_total')?'has lc_web metrics':'MISSING')});
fetch('http://127.0.0.1:3000/api/readyz').then(async r=>console.log('readyz:', r.status, await r.text()));"
PW="docker run --rm --network host -u $(id -u):$(id -g) -e HOME=/tmp -v $PWD/web:/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble"
$PW env BASE_URL="https://localhost:$PORT" node tests/prod-rehearsal.mjs
