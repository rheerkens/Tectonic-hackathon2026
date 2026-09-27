# Testing

| Layer | Command | What it proves |
|---|---|---|
| Config / auth policy | `bun test apps/api/test/config.test.ts` | the dev bypass is refused for `NODE_ENV=production` and every `RAILWAY_*` marker; Clerk requires a secret |
| API integration (embedded Postgres) | `bun test apps/api` | health, 401/403/404 rules per role, validation errors, **persistence across API restart and database restart**, member management |
| Realtime | `bun test apps/api/test/realtime.test.ts` | auth-before-subscribe, project scoping, non-members get nothing, **cross-session events arrive after persistence**, reconnect + refetch, membership revocation kicks subscribers |
| Web realtime client | `bun test apps/web` | reconnect with backoff, resubscribe, `onReconnect` for refetching, reference-counted subscriptions |
| Launcher | `bun test tools/dev` | port probing skips busy ports (hash is only a hint), preferred-port reuse, duplicate launch rejection, stale lock recovery, worktree resolution |
| Worktree isolation (integration) | `bun test tools/dev/test/isolation.test.ts` | two worktrees run distinct stacks (ports, data dirs, locks), duplicate launch rejected, stopping one leaves the other running. Creates a temporary `git worktree` from `HEAD`; skips if the launcher is not committed yet |
| Browser end-to-end | `bun run test:e2e` | identity picker → seeded board; task persists across reload; **two browser sessions** see each other's changes live (flash + toast); **offline → reconnect** refetches what was missed; viewer/non-member permissions in the UI; mobile layout |
| Production image | CI job `check` | `docker build` of the Railway image; running it with `AUTH_MODE=dev-bypass` and Railway variables must fail with "rejected in production" |

`bun run check` runs typecheck + `bun run test` + web build. `bun run test` scopes `bun test` to `apps`, `packages` and `tools/dev`, so browser tests only run via `bun run test:e2e`.

The e2e suite launches its own stack under the `e2e` profile with a freshly seeded database (`--reset-db`), so it never touches the developer's `dev` data and can run while `bun run dev` is up. Set `E2E_BASE_URL=http://localhost:<web port>` to run it against an existing stack instead.

CI (`.github/workflows/ci.yml`) runs both jobs on pushes to `main`/`setup` and on pull requests.
