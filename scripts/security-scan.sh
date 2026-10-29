#!/usr/bin/env bash
# Internal security scan (NOT an independent penetration test): dependency audits, secret scan, and an OWASP ZAP baseline crawl of
# the production topology (web image behind Caddy with TLS) as a signed-in member, passive rules only. Authorization and CSRF
# behaviour is covered by the e2e suites (tenant isolation, ownership, role gating). Output: web/test-results/security/.
# The web container talks to the dev database, so the scan creates one throwaway member account (zap-*@example.test).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
OUT=web/test-results/security; rm -rf "$OUT"; mkdir -p "$OUT"; chmod 777 "$OUT"

echo "== web dependencies (pnpm audit)"
(cd web && corepack pnpm audit 2>&1 | tail -20) | tee "$OUT/pnpm-audit.txt" | grep -E "vulnerabilit|Severity|No known" || true
echo "== python dependencies (pip-audit)"
docker run --rm --user 0 legal-consult-dev-ai:latest sh -c 'pip install -q pip-audit >/dev/null 2>&1; pip freeze > /tmp/r.txt; pip-audit -r /tmp/r.txt --no-deps --disable-pip 2>&1 | tail -15' | tee "$OUT/pip-audit.txt" | grep -E "vulnerab|No known" || true
echo "== secrets in git history and tree (gitleaks)"
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo --no-banner --redact 2>&1 | tail -4 | tee "$OUT/gitleaks.txt" || true

echo "== production topology"
KEEP=1 scripts/rehearse-prod.sh >"$OUT/rehearsal.txt" 2>&1 || { tail -5 "$OUT/rehearsal.txt"; echo "rehearsal failed"; exit 1; }
trap 'docker rm -f lc-rehearsal-web lc-rehearsal-caddy >/dev/null 2>&1 || true' EXIT
B=https://localhost:8443
E="zap-$(date +%s)@example.test"
curl -sk -c "$OUT/jar.txt" -o /dev/null "$B/login"
curl -sk -b "$OUT/jar.txt" -c "$OUT/jar.txt" -o /dev/null -X POST "$B/api/auth/sign-up/email" -H 'content-type: application/json' -H "origin: $B" -d "{\"email\":\"$E\",\"password\":\"correct-horse-9\",\"name\":\"zap\"}"
TOKEN=$(awk '$6 ~ /session_token/ {print $6"="$7}' "$OUT/jar.txt" | sed -n 1p || true)
[[ -n "$TOKEN" ]] || { echo "could not get a session"; exit 1; }
# ZAP talks to the web container directly on the compose network (its Java TLS client sends no SNI for localhost, which Caddy's internal CA rejects);
# the production headers are the same because they come from the app, not from the proxy.
docker run --rm --network legal-consult-dev_default -v "$PWD/$OUT:/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t "http://web:3000/library" -m 5 -j -J zap.json -r zap.html -I \
  -z "-config replacer.full_list(0).description=session -config replacer.full_list(0).enabled=true -config replacer.full_list(0).matchtype=REQ_HEADER -config replacer.full_list(0).matchstring=Cookie -config replacer.full_list(0).replacement=${TOKEN}" \
  >"$OUT/zap.txt" 2>&1 || true
python3 - "$OUT/zap.json" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print("ZAP report missing:", e); sys.exit(1)
rows = []
for site in d.get("site", []):
    for a in site.get("alerts", []):
        rows.append((a["riskdesc"].split(" ")[0], a["name"], len(a.get("instances", []))))
order = {"High": 0, "Medium": 1, "Low": 2, "Informational": 3}
for risk, name, n in sorted(rows, key=lambda r: (order.get(r[0], 9), r[1])):
    print(f"{risk:14} {n:3}  {name}")
print("alerts:", len(rows), "| high:", sum(r[0] == "High" for r in rows), "| medium:", sum(r[0] == "Medium" for r in rows))
PY
