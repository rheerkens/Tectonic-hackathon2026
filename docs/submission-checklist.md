# Indien-checklist (Builderbase) - issue #16

Unchecked = needs a human. Checked = verified in the repo. After the final submit: **no more code changes.**

## Repo
- [ ] Repo `rheerkens/Tectonic-hackathon2026` is **public** (currently PRIVATE; Settings > Danger zone > Change visibility).
- [x] `README.md` present (what it is, how to run, security, roadmap/unfinished in section 11).
- [x] `.env` files are not tracked (only `.env.example`); `git grep` for key patterns (`sk-...`, private keys) finds nothing.
- [ ] Re-run right before submit: `git grep -n -I -i -E "sk-|secret|api[_-]?key|token|BEGIN .*PRIVATE"` and `git ls-files | grep -i env`; also check git history if a key was ever committed.
- [ ] Clerk/Railway values in docs are placeholders only (no real ids).
- [ ] Final state is merged on `main` and `bun run check` is green.

## Links
- [ ] Every link in README and docs opens (only `localhost` and `bun.sh` links exist today; add demo/video URLs, then re-check).
- [ ] Video link works while logged out (<3 min, see C6).
- [ ] Deployed demo URL (if any, Railway) works; otherwise say "run locally" in the description.

## Aikido (C1)
- [ ] Screenshot "voor" (baseline scan) saved.
- [ ] Screenshot "na" (after fixes: IDOR, authn, authz, business logic) saved.
- [ ] Both attached in the Builderbase submission.

## Builderbase submission
- [ ] Short description pasted (suggested below).
- [ ] Repo URL, video URL and Aikido screenshots filled in.
- [ ] Submit, then freeze the code.

### Suggested description
SD Trust (Trust Lens): project answers with per-claim trust scores, sources and live collaboration. Built for the SD Worx challenge with React, Hono, Postgres/Drizzle and realtime WebSockets. Permissions are enforced on every request and realtime subscription. See the README for architecture, security and what is unfinished.
