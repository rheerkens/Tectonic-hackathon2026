# Parallel development in git worktrees

`bun run dev` is designed so that several checkouts of this repository (git worktrees, or plain clones) can run at the same time on one machine without touching each other.

## What the launcher does (`tools/dev`)

1. **Finds the worktree root** with `git rev-parse --show-toplevel`. All state lives in `<root>/.local/<profile>/` (git-ignored). The default profile is `dev`.
2. **Rejects duplicate launches.** `.local/<profile>/dev.lock` stores the launcher pid. A second `bun run dev` in the same worktree exits with code 3 and prints the running URLs. Stale locks from dead processes are replaced automatically.
3. **Allocates ports.** The previous run's ports are reused when still free (stable URLs). Otherwise a contiguous block of three (web, api, postgres) is probed starting at an offset derived from the path hash; every port is actually bound on `0.0.0.0`, `127.0.0.1` and `::` before being accepted. Ports recorded by other worktrees (`git worktree list`) are skipped even if their stack is down. Range 10000–59999.
4. **Starts Postgres** (embedded binaries from `embedded-postgres`) with the data directory `.local/<profile>/postgres`. A fresh directory is initialised once; afterwards data persists across restarts. A stray `postgres` from a hard-killed previous run of the same worktree is stopped first (it is the only process the launcher ever kills that it did not spawn).
5. **Migrates and seeds.** Migrations from `packages/db/drizzle` are applied; the seed runs only when there are no projects yet.
6. **Starts the API** (`bun --watch apps/api/src/index.ts`) and **Vite** (under Bun, proxying `/api` and `/ws` to the API), waits for both health checks, prints the banner and writes `runtime.json`.
7. **Shuts down only its own children** on `Ctrl+C`/`SIGTERM`: SIGTERM, then SIGKILL after 5 s; then Postgres. Children also watch the launcher pid and exit if it disappears, so a hard kill leaves no orphans.

## runtime.json

```json
{
  "status": "ready",                 // starting | ready | stopped | failed
  "profile": "dev",
  "worktree": { "root": "/path/to/checkout", "name": "checkout", "id": "1a2b3c4d" },
  "launcherPid": 12345,
  "ports": { "web": 49000, "api": 49001, "postgres": 49002 },
  "urls": { "web": "http://localhost:49000", "webLan": ["http://100.79.13.72:49000"], "api": "...", "apiHealth": "...", "ws": "...", "database": "postgres://..." },
  "env": { "DATABASE_URL": "...", "API_PORT": "49001", "WEB_PORT": "49000", "AUTH_MODE": "dev-bypass" },
  "pids": { "api": 1, "web": 2, "postgres": 3 },
  "paths": { "local": "...", "postgresData": "...", "logs": "...", "lock": "...", "runtime": "..." }
}
```

`bun run dev:env` prints the `env` block as shell exports: `eval "$(bun run --silent dev:env)"` then `bunx drizzle-kit studio` or `psql "$DATABASE_URL"`.

## Common tasks

| Task | Command |
|---|---|
| New worktree | `git worktree add ../feature -b feature && cd ../feature && bun install && bun run dev` |
| Fresh database | `bun run dev --reset-db` |
| API only (no Vite) | `bun run dev --api-only` |
| Separate stack for tests/demos | `bun run dev --profile e2e --reset-db` |
| Stop from another terminal | `bun run dev:stop` (add `--profile <name>`) |
| See what is running | `bun run dev:status` |

## Environment

`.env` at the repository root (copy from `.env.example`) is loaded by Bun for the launcher and inherited by every child process. Per-worktree overrides simply live in that worktree's `.env`.

## Troubleshooting

- *"Bun >=1.4.2 is required"* or *"socket.destroySoon is not a function"*: install the pinned runtime with `curl -fsSL https://bun.sh/install | bash -s -- bun-v1.4.2` and check `bun --version`. Older runtimes cannot read `bun.lock` and can fail to proxy WebSockets; `bun install` fails (and restores `bun.lock`), and the launcher rejects them before changing locks, ports or database files.
- *"A dev stack for this worktree is already running"*: another terminal owns it; use `bun run dev:stop` or press `Ctrl+C` there.
- *"previous port 49000 is busy; using 49010 instead"*: something else took the port; the launcher moved on. URLs are in the banner and `runtime.json`.
- *Postgres refuses to start / "lock file exists"*: the launcher stops stale servers from its own data directory automatically; if the pid file points at a foreign process, remove `.local/<profile>/postgres/postmaster.pid` manually.
- *Linux: `initdb` fails with a missing `libicu`*: run `bun install` again; the postinstall step that hydrates the bundled library symlinks must run (the `@embedded-postgres/*` packages are in `trustedDependencies`).
