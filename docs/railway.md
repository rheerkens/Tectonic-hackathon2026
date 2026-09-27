# Railway deployment

Status: **prepared, not linked.** No project ids, tokens or domains are in the repository. Everything below is ready to activate once the Railway project details and credentials are available.

## Shape of the deployment

- One **web service** built from the `Dockerfile`: the Hono API serves the API, the WebSocket endpoint and the built React app (`SERVE_STATIC=1`) on Railway's `$PORT`.
- One **Postgres** database (Railway plugin). `DATABASE_URL` is injected by reference.
- Migrations run as Railway's **pre-deploy command** (`bun run db:migrate`, see `railway.json`), so a deploy never starts serving before the schema is current.
- Health check: `GET /api/health` (returns 503 until the database answers).
- Authentication must be **Clerk** (`AUTH_MODE=clerk`). The server refuses to boot with the dev bypass when any `RAILWAY_*` variable is present, and `scripts/railway-deploy.sh` refuses to deploy a `.env` that sets the bypass.

Files: `Dockerfile`, `.dockerignore`, `railway.json`, `scripts/railway-link.sh`, `scripts/railway-deploy.sh`, `.github/workflows/deploy-railway.yml`.

## One-time setup (exact remaining steps)

1. Install the CLI: `bun add -g @railway/cli@5.62.1` and `railway login` (or `railway login --browserless`).
2. In the Railway dashboard: create the project (or use the one you will be given), add a **Postgres** database, and add an empty service named `api` (any name works; use it below).
3. Link this checkout (no ids are guessed; you pass them):
   ```sh
   RAILWAY_PROJECT_ID=<project id> RAILWAY_ENVIRONMENT=production RAILWAY_SERVICE=api bun run railway:link
   ```
4. Set service variables (dashboard → service → Variables, or `railway variables --set KEY=value`):

   | Variable | Value |
   |---|---|
   | `AUTH_MODE` | `clerk` |
   | `CLERK_SECRET_KEY` | from Clerk |
   | `CLERK_PUBLISHABLE_KEY` | from Clerk |
   | `VITE_CLERK_PUBLISHABLE_KEY` | from Clerk (build-time; baked into the web bundle) |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference to the database service) |
   | `CORS_ORIGINS` | only if a native shell or a second origin calls the API, comma separated |

   Railway sets `PORT`, `RAILWAY_*` and `NODE_ENV` is set in the image. Do **not** set `AUTH_MODE=dev-bypass`; the service would crash-loop with a configuration error by design.
5. Deploy: `bun run railway:deploy` (runs `railway up --ci --detach` for the linked service). Watch the build; the health check must go green.
6. Verify: `curl https://<service domain>/api/health` → `"authMode":"clerk"`, `"database":"ok"`. Open the domain: Clerk sign-in appears.
7. Automated deploys: in GitHub → repository settings → Secrets and variables → Actions, add the secret `RAILWAY_TOKEN` (a **project token** from Railway → project → Settings → Tokens, scoped to the environment) and the variables `RAILWAY_SERVICE=api` and `RAILWAY_ENVIRONMENT=production`. The `Deploy to Railway` workflow then deploys every push to `main` (and can be run manually). Until those exist it exits early with a notice instead of failing.

## Operating notes

- Rollback: Railway dashboard → Deployments → redeploy a previous build. Migrations are forward-only; write a new migration to undo schema changes.
- Logs: `railway logs` (after linking) or the dashboard.
- Custom domain: add it on the service; if the API and web are ever split into two services, set `VITE_API_ORIGIN` on the web build and `CORS_ORIGINS` on the API.
- Local check of the image: `docker build -t tectonic .` then `docker run -e DATABASE_URL=... -e AUTH_MODE=clerk -e CLERK_SECRET_KEY=... -e PORT=3000 -p 3000:3000 tectonic`.
