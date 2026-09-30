# Chat demo scenarios (U3, #22)

> **Chat integration input for S1 (#18).** The corpus and the five source-level scenarios are in [scenarios.md](scenarios.md) (Sébastien, #13/#18). This file is the **chat view** of them: per scenario the user, chat context, question, expected tool sequence, expected status and verdicts, cited and rejected sources, and what must be visible in the UI. Ids `D1..D9` map to the five main scenarios (see the table). #18 may replace or extend this file.

Expectations are **verdicts, statuses and ranges, never exact scores** (the seed scores are 100 / 80 / 60 / 40 / 20 because the four checks are all or nothing). Re-check after every seed change (`bun run dev --reset-db`).

| Id | What it shows | scenarios.md |
|---|---|---|
| D1 | Reliable answer, client exception beats the general rule | 2 |
| D2 | Conflicting and outdated sources on one topic | - |
| D3 | Wrong-market sources (NL vs BE), incl. a topic that only exists for the other country | 1 (S5), 2 |
| D4 | Knowledge gap: abstain (no topic, and topic without an applicable source) | - |
| D5 | Access scoping: same question as wanne vs sebastien | 4 |
| D6 | Follow-up question in the same conversation | 5 (vervolg) |
| D7 | Period sensitivity, October vs November 2026 (#63) | 5 |
| D8 | General rule only (no client selected) | 1 (context) |
| D9 | New topics: approved process vs unconfirmed note / archived version | corpus |
| D10 | Two approved sources disagree (needs S33) | 3 |

## How to run a scenario

`bun run dev --reset-db` (URLs in `.local/dev/runtime.json`). Without `ANTHROPIC_API_KEY` the chat runs its deterministic fallback (`mode: "fallback"`, UI badge "Zonder AI-model (regels)"); with a key it runs the model loop (`mode: "llm"`). The tool sequence below is the **fallback** sequence; in llm mode the model chooses, but must call `assess_trust` and cite only sources the user may see. The API allows 20 chat requests per user per minute.

```sh
curl -s -X POST $API/api/chat -H 'x-dev-user: demo_wanne' -H 'content-type: application/json' -d '{
  "messages": [{"role":"user","content":"Tot wanneer mag Atlas loonmutaties aanleveren?"}],
  "context": {"country":"BE","client":"Atlas","period":"2026-10"} }'
```

For a follow-up, send the earlier turns too (user and assistant, oldest first). In the browser open `?as=wanne`, use the Lumi panel, set Land / Klant / Periode. **Note:** at the time of writing the Lumi panel is not mounted on `main` (the project chat from #79 replaced it in `KennisPage`); the UI checks below were done with `ChatPanel` temporarily mounted, see the PR description.

## Seed recap

| Code | Topic | Team | Country | Client | Value | Verdict in BE / Atlas / oktober 2026 |
|---|---|---|---|---|---|---|
| S4 | loonmutaties | Atlas | BE | Atlas | 22 oktober 2026 (approved, only valid in 2026-10) | Geldige uitzondering |
| S1 | loonmutaties | Payroll BE | BE | - | 20 oktober (approved, only 2026-10) | Algemene regel |
| S9, S10, S11, S3 | loonmutaties | Atlas | BE | Atlas | mail chain, meeting minutes, Teams correction, Teams chat (25 oktober) | Niet bevestigd |
| S2 | loonmutaties | Payroll BE | BE | - | 15 oktober, superseded by S1 | Vervangen door S1 |
| S5 | loonmutaties | Payroll BE | NL | - | 18 oktober | Ander land |
| S6 | ziekmelding | Payroll BE | BE | - | Binnen 24 uur | Algemene regel |
| S7 | ziekmelding | Atlas | BE | Atlas | Binnen 48 uur (Teams, unconfirmed) | Niet bevestigd |
| S34 | ziekmelding | Payroll BE | BE | - | Binnen 72 uur (old, expired 2025, not marked superseded) | Niet geldig in deze periode |
| S32 | ziekmelding | Payroll BE | NL | - | same-day receipt (NL procedure) | Ander land |
| S8 | eindejaarspremie | Payroll BE, audience also Atlas | BE | Atlas | 15 december | Geldige uitzondering (only users in both teams) |
| S14 / S15 | verlof | Payroll BE | BE | - | approved process / unconfirmed Teams note | Algemene regel / Niet bevestigd |
| S16 / S17 | loonindexering | Payroll BE | BE | - | approved checklist / untraceable "2 procent" note | Algemene regel / Niet bevestigd |
| S23 / S24 | maaltijdcheques | Payroll BE | BE | - | approved process / unconfirmed "alle kalenderdagen" | Algemene regel / Niet bevestigd |
| S21 / S22 | vakantiegeld | Payroll BE | BE | - | approved checklist / archived, superseded by S21 | Algemene regel / Vervangen |
| S25 / S26 | ziekteloon | Payroll BE | NL | - | approved control procedure / unconfirmed "100 procent" | (NL context) Algemene regel / Niet bevestigd |
| S28 | telewerkvergoeding | Payroll BE | BE | - | only an unconfirmed, untraceable note | no applicable source |

Users: **wanne** (both teams), **roy** (owner of both), **sebastien** (only Payroll België: no S3, S4, S7, S8, S9-S11, S13, S19, no client "Atlas" in his client list).
No source exists on: dertiende maand, bedrijfswagen, pensioen, kerstpakket.

## Scenarios

### D1. Reliable answer, client exception wins
- **User / context:** wanne; België, klant Atlas, oktober 2026.
- **Question:** "Tot wanneer mag Atlas loonmutaties aanleveren?" (chip 1)
- **Expected tools:** `find_knowledge` (8 sources) then `assess_trust` (BE / Atlas / 2026-10) then `get_source` S4.
- **Expected status:** *Onderbouwd* (>= 80). Answer **22 oktober 2026 [S4]**.
- **Cited / rejected:** S4 (exception). S1 general rule (the exception goes first); S9, S10, S11, S3 not confirmed (a forwarded mail, a proposal in minutes, a correction, a chat are not approvals); S2 superseded by S1; S5 other country.
- **UI:** green badge, "Onderbouwing 100/100", source pills with the off ones marked, *Waarom niet?* with seven rows, *Stappen (3)*, footer "Antwoord voor België · Atlas · Oktober 2026".

### D2. Conflicting and outdated sources on one topic
- **Context / question:** wanne; België, Atlas, oktober 2026; "Binnen welke termijn moet een ziekmelding doorgegeven worden?" (chip 2)
- **Expected:** same three tools; *Onderbouwd*, **Binnen 24 uur [S6]**. Rejected: S7 (48 uur) not confirmed; S34 (72 uur) not valid in this period; S32 other country.
- **Visible:** 24 / 48 / 72 uur on screen, one supports the answer. The text says that **no confirmed agreement for Atlas exists** and that S7 does not count.

### D3. Wrong-market sources
- **D3a.** wanne; **Nederland**, Atlas, oktober 2026; "Tot wanneer mag Atlas loonmutaties aanleveren?" -> *Onderbouwd*, **18 oktober [S5]**. S1, S4, S9, S10, S11, S3 "Ander land", S2 superseded. Footer "Antwoord voor Nederland".
- **D3b.** same context, "Binnen welke termijn moet een ziekmelding doorgegeven worden?" -> **S32** (NL procedure, "registreer ontvangst op dezelfde werkdag"); S6, S7, S34 are "Ander land": the Belgian 24-uur rule must not be used for NL.
- **D3c (wrong market only).** wanne; Nederland, Atlas, oktober 2026; "Hoe wordt een verlofaanvraag verwerkt?" -> *Geen onderbouwd antwoord*: topic verlof exists but S14 and S15 are BE only. Tools: `find_knowledge` (2 sources), `assess_trust`; no `get_source`. The answer says that sources for another country do not apply.

### D4. Knowledge gap, abstain
- **Context:** wanne; België, Atlas, oktober 2026.
- **D4a no topic:** "Wat is de regel voor de dertiende maand?" (chip 4), "Wat is de regel voor de dertiende maand bij Atlas?", "Heeft Atlas recht op een bedrijfswagen?". Expected: `find_knowledge` ("geen bronnen gevonden in de teams waar je toegang toe hebt") then `assess_trust`; *Geen onderbouwd antwoord*; no cited sources; answer starts "Hier is geen onderbouwd antwoord voor ..."; no tool errors. UI: grey badge, *Kennislacune* note, no pills, *Stappen (2)*.
- **D4b topic but nothing applicable:** "Wat is de telewerkvergoeding?" -> *Geen onderbouwd antwoord*; S28 is found but only an untraceable, unconfirmed note; the answer names it and says nothing applies.
- **Regression guard:** before U3 a generic word ("maand", "uitbetalen", "wordt") or the client name produced a confident *Onderbouwd* answer from an unrelated topic (see [Matching](#topic-matching-fix)).
- **Known limit:** "Hoeveel vakantiedagen heeft een werknemer?" still matches *verlof* (S14) through the shared word stem "vakant"; do not use it as a gap example.

### D5. Access scoping
- **D5a.** "Tot wanneer mag Atlas loonmutaties aanleveren?" as wanne (Atlas) = D1. As **sebastien**: the Atlas client is not in his list, context "Alle klanten": *Onderbouwd*, **20 oktober [S1]**; sources S1, S2, S5 only. **No trace of S3, S4, S9-S11** in answer, pills, *Waarom niet?* or *Stappen* ("3 bronnen (S1, S2, S5)"). Via the API with client "Atlas" for sebastien the answer is still S1 and adds: "ik vond geen specifieke afspraak voor klant Atlas ... Dat betekent niet dat er geen bestaat". The badge still says *Onderbouwd* (the general rule is well founded); the caution is in the text.
- **D5b.** "Wanneer wordt de eindejaarspremie voor Atlas uitbetaald?" (chip 3): wanne *Onderbouwd*, **15 december [S8]** (audience Payroll BE and Atlas). sebastien: *Geen onderbouwd antwoord*, "Ik vond geen bron over dit onderwerp in de teams waar je toegang toe hebt"; not a ziekmelding answer (earlier bug), no hint that S8 exists.

### D6. Follow-up in the same conversation
- wanne; BE, Atlas, oktober 2026. Turn 1 = D1.
- **"En voor Nederland?"** has no subject of its own, so the tools get the previous question too (`find_knowledge` query "Tot wanneer ... aanleveren? En voor Nederland?"), `assess_trust` runs for Nederland: **18 oktober [S5]**, answer starts "Ik beoordeel dit voor Nederland in plaats van België, omdat je dat in je vraag noemt. Ik lees dit als vervolg op je vorige vraag." Footer "Antwoord voor Nederland".
- **"En de ziekmelding?"** has its own subject: answered alone, D2 (S6).
- **"En maaltijdcheques?"** is answered alone (S23). **"En de dertiende maand?"** stays a gap and never inherits the previous topic.
- Country and month named in the message override the selects; one country, one month or "volgende/vorige maand", an optional year; never the client. In llm mode the model does this through `assess_trust` arguments (system prompt rule 7).

### D7. Period sensitivity (#63)
- wanne; België, Atlas. **Oktober:** D1. **November** (Periode select, or turn 2 "En voor november?" / "En voor volgende maand?"): *Geen onderbouwd antwoord*; S1, S4, S9, S10, S11 "Niet geldig in deze periode", S3 not confirmed, S2 superseded, S5 other country. Tools: `find_knowledge`, `assess_trust`.
- **Visible:** "Bronnen die voor een andere periode gelden ([S1], ...) neem ik niet over voor november 2026"; all pills off; *Kennislacune* note naming "loonmutaties"; footer "November 2026". The October date is not reused.

### D8. General rule only
- wanne; België, **Alle klanten**, oktober 2026; the D1 question -> *Onderbouwd*, **20 oktober [S1]**; S4, S9, S10, S11, S3 "Andere klant", S2 superseded, S5 other country. The client context, not the wording of the question, selects the exception.

### D9. New topics: approved process versus unconfirmed note
wanne; BE, Atlas, oktober 2026.
- "Welk percentage loonindexering moet ik toepassen?" -> *Onderbouwd* **S16** (check barema first); S17 "2 procent" is *Niet bevestigd* and is shown, not used.
- "Mag ik maaltijdcheques uitbetalen?" -> **S23**; S24 *Niet bevestigd*.
- "Hoe bereken ik het vakantiegeld?" -> **S21**; S22 *Vervangen door S21*.
- Nederland: "Hoeveel ziekteloon betaal ik bij ziekte?" -> **S25**; S26 "100 procent" *Niet bevestigd*.

### D10. Two approved sources disagree (needs S33, see [scenarios.md](scenarios.md) scenario 3)
After inserting S33 (23 oktober, also approved, same scope) into a throwaway database, the D1 question gives: `**Tegenstrijdige bronnen**: [S4] 22 oktober 2026 tegenover [S33] 23 oktober 2026`, "Ik kies geen definitieve waarde: laat de verantwoordelijke bevestigen welke geldt", both quotes, and the rest of the sources. The status badge is still *Onderbouwd* (each source alone is well founded; the engine does not know about conflicts). This is the chat's behaviour; the engine status is an open point.

## Checklist per answer ("traceable")
1. Badge/status comes from the engine (`assess`), not from the prose.
2. Every `[Sx]` in the answer is a source the user may see; pills show the same sources with their verdict.
3. *Stappen* lists each tool call with the arguments actually used (country/client/period) and the sources it touched.
4. Rejected sources carry a reason (*Vervangen door S1*, *Ander land*, *Niet geldig in deze periode*, *Niet bevestigd*, *Andere klant*).
5. The footer names the context the answer was rated for (`result.context`).

## Topic-matching fix
`assess` (used by `/api/ask`, `/api/check` and the chat tools `find_knowledge` and `assess_trust`; `/api/naive-answer` keeps its own plain word overlap on purpose, it is the "gewone AI" contrast) used to pick a topic when a **single** question word occurred anywhere in a source. Now (`packages/shared/src/onderbouwing.ts`):
- Words that say nothing about the topic are ignored: stop words, generic words (*maand*, *jaar*, month names, *uitbetalen*, *procedure*, *deadline*, *termijn*, ...; compared by stem), digits, the country and client names (the chat's client and the clients of the visible sources). "Atlas" selects a client, not a topic.
- Per topic, words found in any title, topic or keywords count 1, words that only occur in a claim or value count 0.5.
- A topic matches only when its evidence is at least 1 (one curated word) and more than a third of the remaining question words are backed.

Measured on 34 questions against the 32-source seed: old engine 9 wrong, new engine 2 wrong (one related-topic collision "vakantiedagen", one paraphrase "Wie keurt een klantuitzondering goed?" that now abstains). The llm path rewrites the question before `assess_trust`.

## Gaps and inputs for #13 and #18
- **Chat panel not mounted on main.** #79 replaced the Lumi panel by the project chat in `KennisPage`; `/api/chat` and these scenarios are only reachable through the API or by mounting `ChatPanel`. Product decision needed.
- **Conflict status:** the engine ranks by verdict then score; equally strong contradicting sources (D10) are not a status. The chat says so in words only.
- **Access nuance:** for a user without the client agreement the badge says *Onderbouwd* for the general rule; draaiboek scenario 4 wants "kan niet bevestigen welke afspraak voor Atlas geldt". Text only today.
- **Stem collisions** (`vakantiedagen` ~ `vakantiegeld`, 6-letter prefix) and English questions are not handled; a semantic matcher (#5) is the real fix.
- **S34 (72 uur)** is *Niet geldig in deze periode*, not *Vervangen*; the demo step "Markeer als vervangen door S6" changes that live.
- **llm mode** was not run against these scenarios (no API key available); see the PR.
