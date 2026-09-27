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
