# Mobile (Capacitor) and desktop (Tauri)

Both shells load the **same web frontend** (`apps/web/dist`) and talk to the **hosted backend** over HTTPS/WSS. The frontend already supports it: when `VITE_API_ORIGIN` is set at build time, API and WebSocket calls go to that origin instead of the page's own origin; routing is hash-based so `file://` and custom-scheme origins work.

## What is tested vs. scaffolded

| Piece | Status |
|---|---|
| Web app under Vite/Bun, production build, static serving from the API | tested (CI, e2e) |
| `VITE_API_ORIGIN` / `wsUrl()` origin switching, CORS allowlist for native origins | code paths in place; unit-level only, not exercised on a device |
| `apps/web/capacitor.config.ts`, Capacitor packages pinned (`@capacitor/core|cli|android|ios` 8.5.2) | scaffolded; `cap add`/`cap sync` not run here (no Android SDK / Xcode on the dev box) |
| `apps/desktop/src-tauri` (Tauri 2.12 config, Rust crate, icons, capabilities), `bun run desktop:dev` | scaffolded with `tauri init`; **not compiled** (no Rust toolchain on the dev box) |
| Clerk sign-in inside a web view | not tested (no keys yet); notes below |

## Capacitor (iOS / Android)

Prerequisites: Android Studio + SDK (Android), Xcode 15+ and CocoaPods (iOS, macOS only).

```sh
# 1. build the web bundle against the hosted API
VITE_API_ORIGIN=https://<your railway domain> VITE_CLERK_PUBLISHABLE_KEY=pk_live_… bun run build
# 2. add the native projects once (generated folders are git-ignored; commit them if you prefer)
bun run --cwd apps/web cap:add:android
bun run --cwd apps/web cap:add:ios
# 3. copy the bundle into the native projects and open the IDE
bun run --cwd apps/web cap:sync
bun run --cwd apps/web cap:open:android   # or cap:open:ios
```

Live reload against a local stack on a device in the same network: `CAP_SERVER_URL=http://<lan ip>:<web port> bunx cap sync` (the launcher prints LAN URLs). The local stack uses the dev auth bypass, which is fine on a LAN but never available against the hosted backend.

## Tauri (macOS / Windows / Linux)

Prerequisites: Rust (stable) plus the Tauri system dependencies for your OS (https://tauri.app/start/prerequisites/).

```sh
bun run dev                 # in one terminal: the web dev server for this worktree
bun run desktop:dev         # in another: opens a Tauri window on this worktree's Vite URL (read from .local/dev/runtime.json)
bun run --cwd apps/desktop build   # bundles apps/web/dist into installers (set VITE_API_ORIGIN first)
```

`src-tauri/tauri.conf.json` has `devUrl` as a placeholder; `scripts/tauri.ts` overrides it per worktree with `--config`. The default capability set is `core:default`; add plugins (notifications, deep links, updater) as needed.

## Auth considerations for native shells

- The app sends bearer tokens, never cookies, so cross-origin calls from `capacitor://localhost`, `http://localhost` (Android) and `tauri://localhost` work once the API allows those origins (it does by default; extend with `CORS_ORIGINS`).
- Clerk email/password sign-in works inside the web view. OAuth/social providers redirect through the browser: register the app's custom scheme (`com.tectonic.board://…`) as an allowed redirect URL in Clerk and handle the deep link (Capacitor App plugin / Tauri deep-link plugin). Consider Clerk's native SDKs if social sign-in is essential.
- Session tokens are short-lived; `getToken()` refreshes them. The WebSocket sends the token once at connect time; a reconnect fetches a fresh one.
- The dev bypass cannot be used against a production backend (rejected server-side). For device testing without Clerk, point the shell at a local stack over LAN.
