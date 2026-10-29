#!/usr/bin/env bash
# Local CI: everything a PR must pass (CLAUDE.md §7). Usage: scripts/check.sh [--no-docker]
set -euo pipefail
cd "$(dirname "$0")/.."
step() { printf '\n== %s\n' "$*"; }

step "secrets (gitleaks: git history + staged changes)"
GL=(docker run --rm -v "$PWD":/repo -w /repo zricethezav/gitleaks:latest git /repo --config /repo/.gitleaks.toml --no-banner --redact)
if git rev-parse -q --verify HEAD >/dev/null; then "${GL[@]}"; fi
"${GL[@]}" --pre-commit --staged

step "web: typecheck, lint, unit tests, i18n keys"
(cd web && corepack pnpm run typecheck && corepack pnpm run lint && corepack pnpm run test)

step "ai: ruff + pytest (inside the ai image)"
IMG=legal-consult-dev-ai:latest
[[ -n "$IMG" ]] || { echo "build the ai image first: docker compose … build ai"; exit 1; }
docker run --rm -u "$(id -u):$(id -g)" -e PYTHAINLP_DATA=/tmp/pt -e CRYPTO_VECTORS=/seeds/crypto_vectors.json -e KB_PATH=/kb -v "$PWD/ai":/w -v "$PWD/db/seeds":/seeds:ro -v "$PWD/docs/knowledge-base":/kb:ro -w /w "$IMG" \
  sh -c "ruff check --no-cache app eval tests && python -m pytest -q"

echo; echo "all checks passed"
