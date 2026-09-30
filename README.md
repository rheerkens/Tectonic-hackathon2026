# Trust Lens: from "I found something" to "I understand why I can rely on it"

Tectonic Hackathon 2026, **SD Worx challenge** ("Find it. Understand it. Trust it.").

**One role, one moment of doubt.** A payroll consultant inherits a client portfolio. They find an answer, but is it reliable, current and right for *this* client and country? Trust Lens answers the question and makes the trust visible and explainable, with no black box.

- **Trust:** every answer carries a 0-100 confidence made of four visible factors (up to date, accountable owner, source type, fits this market) with fixed weights. See `packages/shared/src/trust.ts`; the answer is the claim of the best source, never generated text.
- **Detect:** contradicting, outdated and ownerless sources are surfaced per question and for the whole portfolio ("Knowledge health").
- **Connect:** when confidence is low, it shows who owns the topic and opens a pre-filled email to them.
- **Capture:** "Add what you know" turns an answer into an owned source. Owners can confirm a source is still correct; anyone can flag it as outdated.
- **Live:** changes propagate over the websocket. Flag a source in one browser and the confidence moves in the other, with a ▲/▼ badge.

Security choices (Aikido themes): every knowledge route goes through `requireProjectAccess`; source ids are always scoped by project (a foreign id is a 404, tested); only a source's owner (or the portfolio owner, for ownerless sources) can verify it; inputs are validated with the shared Zod schemas.

## Run it

```sh
bun install
bun run dev        # prints the URLs; open the web URL with ?as=ada
bun run dev --reset-db   # after pulling schema/seed changes
```

Try, as Ada: "When is the 13th month paid?" (BE, medium: two sources disagree), "What are the meal voucher rules?" (low: a knowledge gap), "How does sick pay work?" (NL, high). Open `?as=grace` in a second window and flag or confirm a source. Tests: `bun run check` and `bun run test:e2e`.

## Not finished / honest limits

- All data is **synthetic demo data** for a fictional client, not legal advice.
- Question matching is keyword overlap (no embeddings or LLM), and only BE and NL exist as markets. Both are one-file swaps (`overlap` in `trust.ts`, `COUNTRIES` in `schemas.ts`).
- Sources are seeded, there is no importer for real documents, Teams or e-mail.
- Two `tools/dev` worktree-launcher tests fail on macOS (`/private` path); they fail without our changes too.

---

# Starter documentation

# Tectonic Hackathon 2026

A web-native TypeScript starter: **Bun** runtime and package manager, **Hono** API with native WebSockets, **React + Vite** frontend, **Postgres + Drizzle** with migrations and synthetic seed data, shared Zod contracts, Clerk-ready auth with a local bypass, Capacitor and Tauri shells, Railway deployment, and scripted video walkthroughs.

One command runs the whole stack, isolated per git worktree:

```sh
bun install
bun run dev
```

## Prerequisites

| Tool | Needed for | Notes |
|---|---|---|
| **Bun 1.4.2** | everything | `curl -fsSL https://bun.sh/install \| bash`. Version pinned in `.bun-version` / `packageManager`. |
| **git** | worktree detection | The launcher derives ports, data directories and locks from the worktree root. |
| Chromium for Playwright | `bun run test:e2e`, `bun run video` | `bun run --cwd tools/e2e install-browsers` (one-time download). |
| ffmpeg + ffprobe | video MP4 export, review frames, decode check | optional; WebM recordings work without it. |
| Docker | building/testing the Railway image locally | optional; CI builds it. |
| Rust toolchain / Xcode / Android Studio | desktop and mobile shells | optional; see [docs/mobile-desktop.md](docs/mobile-desktop.md). |

No Node.js is required: Vite, the API, tests and Playwright all run under Bun. Postgres is embedded (downloaded with `bun install`, no Docker or system Postgres needed).

## Quick start

1. `bun install`
2. `bun run dev` prints the URLs for this worktree, for example:
   ```
   Web       http://localhost:49000      (plus LAN/Tailscale addresses)
   API       http://localhost:49001      (http://localhost:49001/api/health)
   WebSocket ws://localhost:49001/ws
   Postgres  postgres://tectonic:tectonic@127.0.0.1:49002/tectonic
   Runtime   .local/dev/runtime.json
   ```
3. Open the web URL, pick a demo identity (Ada, Grace, Margaret or Alan), and open a second tab with `?as=grace` to watch changes sync live between sessions.
4. `Ctrl+C` (or `bun run dev:stop`) stops only this worktree's processes. Data persists in `.local/dev/postgres`; add `--reset-db` to start fresh.

## What is in the box

| Path | Purpose |
|---|---|
| `apps/web` | React 19 + Vite 8 frontend: project/task board with drag-and-drop, live updates, presence, loading/error/empty states, responsive layout. Also holds `capacitor.config.ts`. |
| `apps/api` | Hono on Bun: REST API, WebSocket realtime, auth (Clerk or local bypass), permissions, static serving of the built web app in production. |
| `apps/desktop` | Tauri 2 scaffold that loads the web app (`bun run desktop:dev`). |
| `packages/shared` | Zod schemas, API route contracts, realtime message types, demo identities. Used by both API and web. |
| `packages/db` | Drizzle schema, SQL migrations (`drizzle/`), deterministic seed. |
| `tools/dev` | The `bun run dev` launcher: per-worktree Postgres, port allocation, lock, runtime info. |
| `tools/e2e` | Browser tests (Playwright under `bun test`): two sessions, reconnect, permissions, mobile layout. |
| `tools/video` | Scripted video walkthrough recorder, offline player packager, review frame extractor. |
| `docs/` | [worktrees](docs/worktrees.md), [auth](docs/auth.md), [testing](docs/testing.md), [railway](docs/railway.md), [mobile-desktop](docs/mobile-desktop.md). |
| `.claude/skills/app-video-walkthrough` | Repo-local skill for producing walkthrough videos with the tool above. |

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Start Postgres, run migrations, seed if empty, start API (`--watch`) and Vite; print URLs. Flags: `--profile <name>`, `--reset-db`, `--api-only`. |
| `bun run dev:stop` / `dev:status` / `dev:env` | Stop this worktree's stack / show `runtime.json` / print `export DATABASE_URL=...` lines for tools like `drizzle-kit studio`. |
| `bun run check` | Typecheck all workspaces, run unit + integration tests, build the web app. |
| `bun run test` | `bun test` for `apps`, `packages` and `tools/dev` (API tests start their own embedded Postgres). |
| `bun run test:e2e` | Browser tests against a freshly seeded, isolated `e2e` profile (set `E2E_BASE_URL` to reuse a running stack). |
| `bun run video` | Record the walkthrough video; `bun run video -- --rehearsal` for a fast check. |
| `bun run db:generate` / `db:migrate` / `db:seed` | Create a migration from schema changes / apply migrations / seed (`--reset` wipes projects and tasks). Use `eval "$(bun run --silent dev:env)"` first for a running stack. |
| `bun run build` | Production build of the web app into `apps/web/dist`. |
| `bun run desktop:dev` | Open the Tauri window against the running dev stack (needs Rust). |
| `bun run railway:link` / `railway:deploy` | Link this checkout to a Railway project / deploy (see [docs/railway.md](docs/railway.md)). |

## How the pieces fit

- **Contracts first.** `packages/shared` defines every request/response schema and route path. The API validates bodies with them; the web client builds requests from them and parses responses. A contract change fails the type check on both sides.
- **Persist, then broadcast.** Route handlers write to Postgres and only then publish an event to the project's WebSocket topic. Clients apply events to their cache; after a reconnect they refetch everything, so nothing is lost while offline (online sync only, no offline conflict resolution).
- **Permissions everywhere.** Project membership (`viewer`, `editor`, `owner`) is checked on every API request and on every realtime subscription; losing membership kicks the live subscription.
- **Auth bypass is local only.** Without Clerk keys the app uses deterministic demo identities. The server refuses to start with the bypass when `NODE_ENV=production` or any `RAILWAY_*` variable is present. See [docs/auth.md](docs/auth.md).

## Remaining external setup

Everything that needs credentials is prepared but intentionally not activated:

1. **Clerk**: put the keys in `.env` (local) or Railway variables; the app switches to real sign-in automatically. Steps in [docs/auth.md](docs/auth.md).
2. **Railway**: create the project and Postgres, run `bun run railway:link`, set variables, then `bun run railway:deploy` or add the GitHub secrets for the workflow. Steps in [docs/railway.md](docs/railway.md).
3. **Native shells**: install platform SDKs and run the documented commands in [docs/mobile-desktop.md](docs/mobile-desktop.md).
