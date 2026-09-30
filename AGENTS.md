# Working in this repository (humans and coding agents)

## Run and inspect

- `bun install` once, then `bun run dev` starts everything for **this worktree**: embedded Postgres, migrations, seed, API (`bun --watch`), Vite. It prints the URLs and writes them to `.local/dev/runtime.json` (git-ignored). Read that file or run `bun run dev:status` instead of guessing ports.
- Running `bun run dev` twice in the same worktree is rejected on purpose. Stop with `Ctrl+C` or `bun run dev:stop`. Never `pkill` by process name: other worktrees run their own stacks.
- Need a separate stack for tests or demos? Use a profile: `bun run dev --profile e2e --reset-db`. Profiles have their own database, ports and lock under `.local/<profile>/`.
- Identity in the browser: `?as=ada|grace|margaret|alan` on the URL, or the picker. For `curl`: header `x-dev-user: demo_ada`. See `packages/shared/src/demo-users.ts`.
- Health: `GET /api/health`. Realtime: WebSocket at `/ws`, first message `{"type":"auth","devUser":"demo_ada"}`, then `{"type":"subscribe","projectId":"..."}`.

## Verify before you finish

- **Do not write new tests** (hackathon: speed over coverage). Applies to every agent (Claude, OpenAI/Codex, others) and humans. Do not add or extend test files; only fix existing tests that your change breaks.

- `bun run check` = typecheck every workspace + `bun run test` + web build. Must pass.
- UI or realtime changes: also `bun run test:e2e` (Playwright in Chromium, two browser sessions, reconnect) and look at the real app.
- Launcher changes: `bun test tools/dev` (unit) and the isolation integration test (`tools/dev/test/isolation.test.ts`, runs when the launcher is committed).
- Schema changes: edit `packages/db/src/schema.ts`, run `bun run db:generate`, commit the SQL in `packages/db/drizzle/`. Migrations are applied by the launcher, by `bun run db:migrate`, and by Railway's pre-deploy command.
- Migration ownership: only lane C runs `db:generate`; others propose schema changes in their PR. Merge small and often into `main` (the integration branch), contracts in `packages/shared` and schema first, consumers after; `bun run check` must be green before every merge.

## Conventions

- Put request/response schemas and route paths in `packages/shared` first; the API validates with them and the web client is typed from them.
- API handlers: check permissions with `requireProjectAccess`, write to the database, then `realtime.publish(...)`. Never broadcast before the write succeeded.
- Realtime subscriptions are project-scoped and re-validated on membership changes; keep it that way.
- Dependencies are pinned exactly (`bunfig.toml` sets `exact = true`); commit `bun.lock`.
- Never commit `.env*` (except `.env.example`), `.local/`, recordings (`tools/video/output/`) or native build output. Placeholders only for Clerk and Railway; do not invent project ids.
- Keep the dev auth bypass local: `AUTH_MODE=dev-bypass` is refused by the server in production/Railway. Do not weaken `apps/api/src/config.ts`.
- Vite runs under Bun (`bunx --bun vite`), the API is `apps/api/src/index.ts`, everything is TypeScript with `verbatimModuleSyntax` and explicit `.ts`/`.tsx` import extensions.

## Product and design

- What we are building and why: `README.md` (Trust Lens, SD Worx challenge). The target look and flow is the prototype in `docs/design/prototype.png`, described in README §12. It includes a list of where the current build differs.

## Layout

`apps/web` (React), `apps/api` (Hono), `apps/desktop` (Tauri), `packages/shared` (contracts), `packages/db` (Drizzle), `tools/dev` (launcher), `tools/e2e` (browser tests), `tools/video` (walkthrough recorder), `docs/` (auth, worktrees, testing, railway, mobile-desktop), `.claude/skills/` (repo-local skills).
