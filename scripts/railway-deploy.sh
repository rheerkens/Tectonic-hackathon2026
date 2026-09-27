#!/usr/bin/env bash
# Deploys the current checkout to the linked Railway service (or to the service
# named by RAILWAY_SERVICE when running with a project token, e.g. in CI).
# Refuses to deploy a configuration that would enable the dev auth bypass.
set -euo pipefail

if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI not found. Install it: bun add -g @railway/cli@5.62.1" >&2
  exit 1
fi

# Guard: the server refuses AUTH_MODE=dev-bypass on Railway at boot, but fail fast here too.
for f in .env .env.production; do
  if [ -f "$f" ] && grep -Eq '^\s*AUTH_MODE\s*=\s*dev-bypass' "$f"; then
    echo "Refusing to deploy: $f sets AUTH_MODE=dev-bypass. Railway must run with AUTH_MODE=clerk." >&2
    exit 1
  fi
done

ARGS=(up --ci)
if [ -n "${RAILWAY_SERVICE:-}" ]; then ARGS+=(--service "${RAILWAY_SERVICE}"); fi
if [ -n "${RAILWAY_ENVIRONMENT:-}" ]; then ARGS+=(--environment "${RAILWAY_ENVIRONMENT}"); fi
if [ "${RAILWAY_DETACH:-1}" = "1" ]; then ARGS+=(--detach); fi

echo "railway ${ARGS[*]}"
railway "${ARGS[@]}"
