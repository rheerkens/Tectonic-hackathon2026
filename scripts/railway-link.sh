#!/usr/bin/env bash
# Links this checkout to the Railway project/environment/service, without guessing ids.
# Usage: RAILWAY_PROJECT_ID=... [RAILWAY_ENVIRONMENT=production] [RAILWAY_SERVICE=api] bun run railway:link
set -euo pipefail

if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI not found. Install it: bun add -g @railway/cli@5.62.1  (or: npm i -g @railway/cli@5.62.1)" >&2
  exit 1
fi

: "${RAILWAY_PROJECT_ID:?Set RAILWAY_PROJECT_ID (Railway dashboard -> project settings -> General -> Project ID)}"
RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"
RAILWAY_SERVICE="${RAILWAY_SERVICE:-api}"

echo "Linking to project ${RAILWAY_PROJECT_ID}, environment ${RAILWAY_ENVIRONMENT}, service ${RAILWAY_SERVICE}"
railway link --project "${RAILWAY_PROJECT_ID}" --environment "${RAILWAY_ENVIRONMENT}" --service "${RAILWAY_SERVICE}"
railway status
echo
echo "Linked. Next: set variables (see docs/railway.md) and run: bun run railway:deploy"
