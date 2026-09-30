# Taakverdeling: SD Trust (SD Worx challenge)

**Doel:** van "ik vond iets" naar "ik begrijp waarom ik erop kan vertrouwen" (SD Worx-brief, pagina 5).
**Demo (3 min):** (1) gewone AI vs. SD Trust zij aan zij, (2) plak een Teams-bericht en zie de tegenspraak, (3) kennis-weerkaart + tijdreis, (4) expert bevestigt live in een tweede browser.
**Jurycriteria:** creativiteit, technische kwaliteit (werkt het?), fit met de challenge, security.

Basis die er al staat: score met vier factoren (`packages/shared/src/trust.ts`), vragen stellen, Knowledge health, verifiëren/flaggen met realtime, seed "Vandeputte Logistics".

## Spelregels (zodat we niet op elkaar vastlopen)
1. **Contracten eerst** in `packages/shared` (AGENTS.md). Lane A en C voegen alleen *nieuwe* schema's onderaan `schemas.ts` toe, niemand herschrijft bestaande.
2. **Alleen lane C maakt migraties** (`bun run db:generate`). Heb je een kolom/tabel nodig? Vraag C, of lever het SQL-voorstel in de PR. Zo botsen er nooit twee migraties.
3. **Een branch per lane** (`lane-a-engine`, `lane-b-ux`, `lane-c-data-security`), kleine PR's naar `setup`, vaak mergen (minstens elk uur).
4. `bun run check` moet groen zijn vóór een merge. UI-wijzigingen: ook `bun run test:e2e` en echt kijken in de browser.
5. **Geen secrets in de repo.** LLM-keys alleen in `.env` (git-ignored), placeholders in `.env.example`.
6. Elke LLM-functie heeft een **deterministische fallback** zonder key. De demo mag nooit van een API afhangen.

## Milestones
| Moment | Wat |
|---|---|
| **M1 (eerste ~45 min)** | Contracten voor A1/A4 gemerged (B mockt daartegen). C draait de Aikido-baseline. |
| **M2 (halverwege)** | Alle lanes werken tegen echte endpoints. Eerste end-to-end demo-run. |
| **M3 (feature freeze, T-60 min)** | Alleen nog fixes, Aikido "na", video opnemen. |
| **M4** | Indienen. Daarna **geen codewijzigingen meer** (regel pagina 12). |

---

## Lane A: Engine en AI (dev 1)
Branch `lane-a-engine`. Bestanden: `packages/shared/src/trust.ts`, `apps/api/src/routes/knowledge.ts`.

- [ ] **A1 (M1, eerst!)** Contract `POST /api/projects/:projectId/check` in `contracts.ts`: body `{ text, country }` (een geplakt Teams-bericht/mail), response `{ claims[], matches[], contradictions[] }` met per claim het oordeel per bron en de trust-uitleg. Stub-implementatie zodat B kan bouwen.
- [ ] **A2** LLM-claim-extractie: vrije tekst → `{ topic, country, claim }` (via OpenAI). Fallback: keyword-overlap zoals nu.
- [ ] **A3** Semantische conflictdetectie in `assess`/`findIssues` (nu: tekstgelijkheid van `claim`). "Paid in December" vs "December payroll" mag geen conflict zijn.
- [ ] **A4 (M1)** Contract en endpoint `POST .../naive-answer`: een gewone AI-antwoord zonder vertrouwen (voor de zij-aan-zij-demo). Zelfde vraag als `/ask`.
- [ ] **A5** Unit-tests voor alles wat scoort (zoals `trust.test.ts`). Limieten op invoerlengte en rate limiting op LLM-endpoints.

## Lane B: Ervaring (dev 2)
Branch `lane-b-ux`. Bestanden: `apps/web/src/components/*` (TrustLens opsplitsen), `styles.css`.

- [ ] **B1** Splits `TrustLens.tsx` in kleine componenten (Answer, Factors, Sources, Health), zodat B en anderen niet in één bestand werken.
- [ ] **B2** **Zij aan zij:** links "gewone AI", rechts SD Trust op dezelfde vraag (gebruikt A4, mock tot die er is).
- [ ] **B3** **Trust-check:** plak een bericht, toon per bewering wat ermee botst (gebruikt A1).
- [ ] **B4** **Kennis-weerkaart:** raster onderwerp × land, gekleurd op vertrouwen, gaten en "enige kenner" duidelijk. Data komt uit `listSources`.
- [ ] **B5** **Tijdreis-slider:** scoort met een verschoven `now`. Kan puur in de browser met `scoreSource` uit shared, geen backend nodig.
- [ ] **B6** Design-polish, animaties (score telt op, live-badge), responsive, toegankelijkheid (contrast, toetsenbord, `aria`).
- [ ] **B7** Tweede-browser-flow voor de demo: duidelijke presence en live-melding ("Grace heeft bevestigd").

## Lane C: Data, security en oplevering (dev 3)
Branch `lane-c-data-security`. Bestanden: `packages/db/*`, `apps/api/src/routes/*` (authz), `tools/*`, `README.md`.

- [ ] **C1 (M1, eerst!)** **Aikido:** repo koppelen, baseline-scan draaien, screenshot "voor". Daarna fixen en screenshot "na" (10% van de score). Vooral IDOR, authenticatie, autorisatie en business logic.
- [ ] **C2** **Seed-corpus uitbreiden:** 30+ realistische, bewust rommelige bronnen (tegenstrijdig, verouderd, ownerless, verkeerd land, Teams-gesprekken). De demo leeft hiervan. Tijdstempels relatief aan de seed-tijd.
- [ ] **C3** **Betwisten:** status `disputed` op een bron (schema + endpoint + realtime + autorisatie), zichtbaar bij iedereen.
- [ ] **C4** Bewaakt de migraties (zie spelregel 2) en `bun run check` op `setup`.
- [ ] **C5** **Autorisatie-tests** voor elke nieuwe route (niet-lid, viewer, ander project, IDOR), zoals `apps/api/test/knowledge.test.ts`.
- [ ] **C6** **Demovideo (<3 min)** met het script bovenaan. `bun run video` kan helpen. **README** bijwerken (wat het is, hoe je het draait, wat onaf is).
- [ ] **C7** Indien-checklist: repo publiek, links gecontroleerd, geen secrets, Aikido-screenshots, beschrijving in Builderbase.

---

## Afhankelijkheden
- B2/B3 wachten op A4/A1 (contract), maar kunnen eerder starten met een mock.
- A2 en C2 versterken elkaar: C schrijft de ruwe teksten, A haalt er de claims uit.
- C3 (betwisten) raakt `schemas.ts`, `realtime.ts` en de UI: C levert eerst het contract, daarna haakt B aan.
