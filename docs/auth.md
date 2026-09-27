# Authentication

Two modes, chosen by configuration, enforced on the server.

| Mode | When | Frontend | Backend |
|---|---|---|---|
| `dev-bypass` | local development, tests, demos, video recordings | identity picker with four deterministic demo users; sends `x-dev-user: <id>` | accepts only known demo ids; **refuses to start** when the environment is production-like |
| `clerk` | production, Railway, any shared deployment | `@clerk/clerk-react` sign-in; sends `Authorization: Bearer <session token>` | verifies the token with `@clerk/backend`, upserts the user row, fetches profile once per user |

## Demo identities

Defined once in `packages/shared/src/demo-users.ts` and used by the seed, the tests and the video tool:

| id | name | seeded roles |
|---|---|---|
| `demo_ada` | Ada Lovelace | owner of Launch Website, editor elsewhere |
| `demo_grace` | Grace Hopper | owner of Mobile App, editor elsewhere |
| `demo_margaret` | Margaret Hamilton | owner of Hackathon Ops, **viewer** of Launch Website |
| `demo_alan` | Alan Turing | editor of Mobile App only (not a member of the others) |

Pick one in the UI, or add `?as=grace` to the URL. Identity is kept in `sessionStorage`, so each browser tab can be a different person.

## Server-side enforcement

`apps/api/src/config.ts` → `resolveAuthMode()`:

- `AUTH_MODE` empty: `clerk` if `CLERK_SECRET_KEY` is set, else `dev-bypass` locally, else a configuration error in production.
- `AUTH_MODE=dev-bypass` with `NODE_ENV=production` **or any `RAILWAY_*` variable** (`RAILWAY_ENVIRONMENT`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`, …) → the process exits with code 78 and a clear message. Tested in `apps/api/test/config.test.ts` and, on the built Docker image, in CI.
- `AUTH_MODE=clerk` without `CLERK_SECRET_KEY` → configuration error.
- In `clerk` mode the `x-dev-user` header is rejected with 401.

Permissions are then checked per project (`viewer` < `editor` < `owner`) for every API route (`requireProjectAccess`) and for every WebSocket `subscribe` (`getProjectRole`). Removing a member kicks their live subscription.

## Activating Clerk (when the keys arrive)

1. In the Clerk dashboard create an application (email/password or any provider) and copy the **publishable key** (`pk_…`) and **secret key** (`sk_…`). No JWT template is required: the default session token is verified locally against Clerk's JWKS.
2. Local: in `.env`
   ```
   AUTH_MODE=clerk
   CLERK_SECRET_KEY=sk_test_…
   CLERK_PUBLISHABLE_KEY=pk_test_…
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_…
   ```
   Restart `bun run dev`. The identity picker is replaced by Clerk's `<SignIn />`; the API verifies bearer tokens. Sign-ups create user rows on first request.
3. Railway: set the same four variables on the service (`VITE_CLERK_PUBLISHABLE_KEY` is a build-time value, so redeploy after changing it). See [railway.md](railway.md).
4. Optional hardening: pass `authorizedParties` (your web origin) to `verifyToken` in `apps/api/src/auth.ts` once the production domain is known.

What is not yet exercised with real keys: the Clerk code paths compile and are wired, but there are no automated tests against a live Clerk instance. The bypass path is what the tests, e2e suite and video use.

## Native shells

Bearer tokens (not cookies) are used everywhere, so Capacitor and Tauri web views work with the hosted API as long as the API's CORS allowlist contains their origins (`capacitor://localhost`, `http://localhost`, `tauri://localhost` are allowed by default; add others via `CORS_ORIGINS`). Clerk OAuth providers need the app's custom URL scheme registered as an allowed redirect in the Clerk dashboard. Details in [mobile-desktop.md](mobile-desktop.md).
