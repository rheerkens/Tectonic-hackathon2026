# Security scan (Aikido, issue #12)

## Done in the repo
- `bun audit` (run 2026-09-30): fixed the high finding by pinning `@clerk/clerk-react` to `5.61.10` (auth bypass advisory GHSA-w24r-5266-9c3c, affected <=5.61.5).
- Resolved (#59): `esbuild <=0.24.2` (GHSA-67mh-4wv8-2f99) came in via `drizzle-kit` > `@esbuild-kit/core-utils` (esbuild 0.18.20). Fixed with a root `overrides` entry pinning `esbuild` to `0.28.2`; `bun audit` now reports no vulnerabilities and `db:generate` still works. Drop the override once drizzle-kit no longer depends on `@esbuild-kit`.
- Secret grep over tracked files: no real secrets, only the `sk_test_…` placeholder in `docs/auth.md`.

## Still manual (needs the Aikido login)
1. Create the account via the link in the guide, connect the repo, run the AI Code Audit, screenshot **before**.
2. Fix findings (IDOR, auth, authorization, business logic), mark them `resolved`, screenshot **after**.
3. Rescan after the feature freeze.
