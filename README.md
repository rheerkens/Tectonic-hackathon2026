# Trust Lens

**From "I found something" to "I understand why I can rely on it."**

Tectonic Hackathon 2026 · SD Worx challenge *"Unlock the Knowledge Within: Find it. Understand it. Trust it."*

> All data in this repository is **synthetic demo data** about a fictional client. Nothing here is legal or payroll advice.

## Contents
1. [The problem](#1-the-problem)
2. [The idea](#2-the-idea)
3. [What it does today](#3-what-it-does-today)
4. [How trust is computed](#4-how-trust-is-computed)
5. [How an answer is built](#5-how-an-answer-is-built)
6. [Architecture and data model](#6-architecture-and-data-model)
7. [API](#7-api)
8. [Security](#8-security)
9. [Run it, try it, test it](#9-run-it-try-it-test-it)
10. [Demo script](#10-demo-script)
11. [Roadmap and what is unfinished](#11-roadmap-and-what-is-unfinished)
12. [Design prototype](#12-design-prototype)

## 1. The problem
Large organisations hold a huge amount of knowledge, but people only act on it with confidence if they can tell whether it is *reliable, current and relevant to this customer or situation*. In practice the same question returns:

- a policy that was updated recently, owned and verified;
- a wiki page nobody owns, from years ago;
- a Teams message that contradicts both;
- a document written for another country.

A search, or an AI assistant that summarises them, returns *an* answer. The hard question is whether to trust it. This is a **trust problem**, not a search problem.

## 2. The idea
We focus on **one role, one workflow, one trust signal**, as the brief asks:

- **Role:** a payroll consultant who inherits a client portfolio. The previous owner left, and the knowledge is spread across documents, chats and colleagues.
- **Moment of doubt:** they found an answer ("the 13th month is paid in December") and need to know if they can rely on it for *this client in this country*.
- **Trust signal:** every answer carries a **confidence score built from four visible factors**, together with the reasons, the sources that disagree, and the people who can help. There is no black box: each number traces to a line of code.

The four "inspiration areas" of the brief map onto the product:

| Brief | In Trust Lens |
|---|---|
| **Trust**: is information relevant and reliable? | Confidence score with a factor-by-factor explanation |
| **Detect**: conflicting, duplicated, missing or outdated knowledge | Contradictions, outdated and ownerless sources, knowledge gaps, per question and portfolio-wide |
| **Connect**: find the right expertise | Owners of a topic, with a pre-filled e-mail to ask them |
| **Capture**: valuable knowledge beyond documents and silos | "Add what you know" creates an owned, dated source; owners confirm, anyone can flag |

## 3. What it does today
Open a client portfolio and ask a question, choosing the market (BE or NL).

1. **Answer.** One sentence, taken from the most trustworthy source that applies to the chosen market, with the source named. It is never generated text.
2. **Confidence ring (0-100) and verdict**: *You can rely on this* / *Check before you rely on this* / *Do not rely on this yet*.
3. **Why this level.** Green/orange/red lines such as "Last reviewed 30 days ago", "Has an owner and was verified by an expert", "Written for BE", "2 other sources give a different answer".
4. **Factor bars** for the answer source, each with its weight ("counts for 30%").
5. **Sources disagree.** The best source next to the conflicting ones, with their trust.
6. **Who can help.** Owners and verifiers of the topic, with "Ask Grace", which opens a pre-filled e-mail. If nobody owns the topic, the people owning the most sources in that market are suggested.
7. **Sources behind this answer**, with owner, verifier, score and actions: *Confirm still correct* (owner only) and *Flag as outdated* (any editor).
8. **Knowledge health** (side panel): contradictions, outdated and ownerless sources for the whole portfolio, and who holds the knowledge.
9. **Add what you know.** Saves an *expert note* you own, in the market you asked about.
10. **Live.** Changes are pushed over the websocket. When a colleague flags or confirms a source, your answer recomputes, a toast appears and the score shows a ▲/▼ badge.

Questions the seeded portfolio answers differently on purpose:

| Question (market) | Result | Why |
|---|---|---|
| When is the 13th month paid? (BE) | **Medium**, 69 | Solid policy, but an outdated wiki page and a Teams chat disagree |
| When is the 13th month paid? (NL) | **High** | NL policy applies; the BE documents are ignored as "written for another market" |
| What are the meal voucher rules? (BE) | **Low** | One ownerless chat message: a knowledge gap |
| How does sick pay work? (NL) | **High** | Owned, verified, recent, written for NL |
| What do I need to take over a portfolio? | **High** | Two sources agree, both owned |

## 4. How trust is computed
Implemented in [`packages/shared/src/trust.ts`](packages/shared/src/trust.ts), shared by the API and the UI, and covered by unit tests (`trust.test.ts`).

`score = round(100 × Σ factor × weight)` with four factors between 0 and 1:

| Factor | Weight | Value |
|---|---|---|
| **Up to date** | 30% | `0.5 ^ (age / half-life)` since last review, where the half-life depends on the source type; `0` if flagged as outdated |
| **Accountable owner** | 20% | `1` owner and verified · `0.7` owner, not verified · `0` no owner |
| **Source type** | 20% | policy `1.0` · manual `0.9` · expert note `0.8` · wiki `0.6` · e-mail `0.4` · Teams chat `0.3` |
| **Fits this situation** | 30% | `1` written for the chosen market · `0.8` generic ("ALL") · `0.1` written for another market |

Half-lives (days): policy 365, manual 540, wiki 180, expert note 180, e-mail 90, Teams chat 60.

Levels: **high** ≥ 75, **medium** ≥ 50, **low** below. The weights and tables are constants at the top of the file, so the team can tune them and argue about them openly. That is the point.

## 5. How an answer is built
`assess(question, sources, { country, now })`:

1. **Match the topic.** Keyword overlap between the question and each source (title, topic, claim, content). The topic with the best overlap wins. Too little overlap means a **knowledge gap**: no answer, and experts are suggested.
2. **Split by applicability.** Sources with a "fits this situation" value below 0.5 are listed as *ignored* and never answer.
3. **Pick the best** applicable source by trust score. Its `claim` is the answer.
4. **Compare the others.** An applicable source with score ≥ 30 and a *different* claim is a **conflict**; one with the same claim **corroborates**.
5. **Confidence** = best score − conflict penalty (25% of the conflicting scores, at most 40) − 8 if there is only one source + corroboration bonus (5 per agreeing source, at most 10).
6. **Reasons** are generated from the factor notes plus the conflict, corroboration, single-source and ignored-source facts.

`findIssues(sources, now)` runs the same ideas portfolio-wide: *outdated* (freshness below 0.3), *ownerless*, and *conflict* (a topic with different claims for the same market).

## 6. Architecture and data model
A Bun monorepo: React + Vite (`apps/web`), Hono API with native websockets (`apps/api`), Postgres via Drizzle (`packages/db`) and Zod contracts shared by both sides (`packages/shared`). A **project is a client portfolio**, so membership, roles and realtime come from the starter.

```
packages/shared  contracts, Zod schemas, trust.ts (pure scoring and assessment)
packages/db      schema.ts (knowledge_sources), migrations, seed "Vandeputte Logistics"
apps/api         routes/knowledge.ts (sources, ask, verify, flag), realtime publish
apps/web         components/TrustLens.tsx, queries and realtime handling
```

`knowledge_sources`: `id`, `project_id`, `title`, `kind` (policy / manual / expert_note / wiki / email / teams_chat), `topic` (slug), `country` (BE / NL / ALL), `claim` (the one-sentence answer), `content`, `owner_id`, `verified_by_id`, `flagged_outdated`, `reviewed_at`, timestamps.

Sources on one topic that give a different `claim` are in conflict, which is why the claim is a separate field. The API writes to the database first and only then publishes `sources.changed` to the project's subscribers (project-scoped, as in the starter).

## 7. API
Contracts live in [`packages/shared/src/contracts.ts`](packages/shared/src/contracts.ts); paths below are relative to `/api/projects/:projectId`.

| Method and path | Role | Purpose |
|---|---|---|
| `GET /sources` | viewer | All sources with trust, plus portfolio-wide issues |
| `POST /ask` | viewer | `{ question, country }` returns the answer, confidence, reasons, conflicts, experts and sources |
| `POST /sources` | editor | Capture knowledge; the caller becomes the owner |
| `POST /sources/:sourceId/verify` | owner of the source | Confirm still correct; refreshes the review date |
| `POST /sources/:sourceId/flag` | editor | `{ flagged }` marks or clears "outdated" |

## 8. Security
Aikido checks business logic, IDOR, authentication and authorization. What we did about each:

- **Authorization:** every knowledge route calls `requireProjectAccess` with the minimum role (viewer to read and ask, editor to change).
- **IDOR:** source ids are always queried *together with* the project id. A source id from another portfolio returns 404, never data.
- **Business logic:** only the owner of a source can verify it (the portfolio owner can adopt an *ownerless* source). Verifying clears the outdated flag, and only that path does so.
- **Validation:** all inputs go through the shared Zod schemas (length limits, country enum, topic slug pattern).
- **Auth:** unchanged from the starter; the dev bypass is refused in production/Railway.
- **Tests:** `apps/api/test/knowledge.test.ts` covers non-members, IDOR, owner-only verification, adoption rules, validation and viewer restrictions.
- No secrets are committed; `.env*` and `.local/` are git-ignored.

## 9. Run it, try it, test it
```sh
bun install
bun run dev              # prints the URLs; open the web URL with ?as=ada
bun run dev --reset-db   # needed once after pulling schema or seed changes
bun run check            # typecheck + tests + build
bun run test:e2e         # Playwright, two browser sessions
```
Demo identities (`?as=`): **ada** (inherits the portfolio), **grace** (BE payroll expert), **margaret** (NL), **alan** (compliance). Start with the **Vandeputte Logistics** portfolio, which opens on the Trust Lens; the **Board** tab is the starter's task board.

## 10. Demo script
1. As Ada, ask *"When is the 13th month paid?"* (BE). Confidence is medium. Show why: two sources disagree, one is outdated and ownerless.
2. Switch to NL: high, because the BE documents are ignored as written for another market.
3. Ask about meal vouchers: a low-confidence knowledge gap, and nobody owns it. Use *Add what you know*.
4. Open `?as=grace` in a second window. Flag the BE policy as outdated: Ada's score drops live with a ▼ badge. Clear the flag: it rises again.
5. Show *Knowledge health* and who holds the knowledge.

## 11. Roadmap and what is unfinished
The team plan is in [`docs/TASKS.md`](docs/TASKS.md). Not built yet:

- Side-by-side comparison with a plain AI assistant.
- "Trust-check this message": paste a Teams message or e-mail and see what it contradicts.
- LLM claim extraction from raw documents and semantic conflict detection (today `claim` is entered by hand and compared as text).
- Knowledge map (topics × markets) and a time-travel slider showing how trust decays.
- A "disputed" status, and a larger seeded corpus.

Known limits:
- Question matching is keyword overlap, with no embeddings or LLM.
- Only two markets (BE, NL); sources come from the seed, with no importer for real documents, Teams or e-mail.
- Two `tools/dev` worktree-launcher tests fail on macOS (`/private` path); they fail without our changes too.

## 12. Design prototype
The target look and flow of the product. It is a prototype (Dutch UI, branded "Tectonic, Kennis met onderbouwing") and **not yet what the app looks like**; the current build is described in §3.

![Design prototype: Kennis zoeken](docs/design/prototype.png)

**Scenario in the mock:** Ada, a payroll consultant, asks *"Tot wanneer mag Atlas loonmutaties aanleveren?"* for Belgium, client Atlas, October 2026.

**Layout**
- **Left:** workspace navigation (*Kennis zoeken*, *Bronnen*, *Experts*) and **"Mijn toegang"**: the teams the user belongs to (*Payroll België*, *Klantteam Atlas*) with a "Toegang gecontroleerd" note. A footer states "Demo met fictieve gegevens".
- **Centre:** breadcrumb (Atlas / Payroll / Oktober 2026), the question, and **context chips** (*België*, *Atlas*, *Oktober 2026*). Below it the answer card: an **"Onderbouwd"** status badge, the answer in large type (*22 oktober 2026*), one sentence of explanation, its validity and who confirmed it ("Bevestigd door Grace"), a **quote from the source**, and a "Bekijk bron" button.
- **"Waarom deze bron?"** table: every candidate source (S1 to S5) with a short categorical verdict instead of a number, e.g. *Geldige uitzondering* (green), *Algemene datum: 20 oktober*, *Vervangen* (an old procedure), *Niet bevestigd* (orange, a Teams chat), *Ander land*. Footnote: *"Een geldig document is niet automatisch van toepassing."*
- **Right panel:** the selected source (*Klantafspraak Atlas*, S4, **version 2**) with an **Onderbouwing score 100/100** split in four checks: *Bevoegd goedgekeurd* 40, *Eigenaar bekend* 20, *Geldig voor deze periode* 20, *Bron herleidbaar* 20. Below: the responsible person (Grace, owner of the client agreement), validity (1 to 31 October 2026), access ("Payroll België én Klantteam Atlas") and a **"Vraag verduidelijking"** button.

**Design principles visible in the mock**
- The score measures the **substantiation, not the chance that the answer is true**. The panel says so explicitly.
- A valid document is **not automatically applicable**: the context (country, client, period) decides which source applies.
- A specific **exception can override the general rule** (the approved Atlas exception beats the general 20 October deadline).
- Every source gets a **plain-language verdict**, so the reason is readable without interpreting numbers.
- **Access is part of trust**: who may see a source is shown and checked.

**Where today's build differs from the prototype** (input for the tickets, not decisions)
| Prototype | Current build |
|---|---|
| Context = country + **client** + **period** | Context = country only |
| Score = *authorised* 40, *owner known* 20, *valid for this period* 20, *traceable* 20 | Score = up to date 30, owner 20, source type 20, fits market 30 |
| Per-source **verdict labels** (exception, superseded, unconfirmed, other country) | Per-source numeric score and tone reasons |
| **Versions** and *Vervangen* (superseded) sources | No versions or supersession |
| **Validity period** on a source | Review date and half-life only |
| Specific exception beats general rule | Highest score wins |
| Access shown and checked per source | Project-level membership only |
| "Vraag verduidelijking" | Pre-filled e-mail to the owner |
| Dutch UI, light design system | English UI |

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
