# Demo scenarios for the chat (U3, #22)

> **Status: chat integration input for S1 (#18).** These scenarios were derived from what is in the repository today (README scenarios, [draaiboek](draaiboek.md), [brondossier](brondossier/README.md), the access examples in `apps/api/src/routes/knowledge.ts` and the current seed). Sébastien's scenario sheet (#18) may replace or extend this file; keep the ids `D1..D9` or map them. The corpus (#13) is not built here: scenarios that need data the seed does not have are listed under [Gaps](#gaps-and-inputs-for-13-and-18).

Every expected outcome below is a **verdict or a range, never an exact score**, except where the seed makes it deterministic enough to be useful (the seeded sources all score 100 or 80 or 40 or 20). Re-check after every seed change (`bun run dev --reset-db`).

## How to run a scenario

Start the stack (`bun run dev --reset-db`, URLs in `.local/dev/runtime.json`). Without `ANTHROPIC_API_KEY` the chat runs its deterministic fallback (`mode: "fallback"`, UI badge "Zonder AI-model (regels)"); with a key it runs the model loop (`mode: "llm"`). The tool sequence below is the **fallback** sequence; in llm mode the model chooses, but must call `assess_trust` at least once and cite only visible sources.

```sh
API=http://localhost:<api port>
curl -s -X POST $API/api/chat -H 'x-dev-user: demo_wanne' -H 'content-type: application/json' -d '{
  "messages": [{"role":"user","content":"Tot wanneer mag Atlas loonmutaties aanleveren?"}],
  "context": {"country":"BE","client":"Atlas","period":"2026-10"} }'
```

In the browser: open `?as=wanne`, press the Lumi launcher bottom right, pick a chip or type the question. Set the three context selects (Land, Klant, Periode) as in the scenario. Check the answer badge, the source pills (off-verdict sources are struck through), *Waarom niet?* and *Stappen*.

## Seed recap (what the scenarios rest on)

| Code | Topic | Team | Country | Client | Value | Verdict in BE / Atlas / oktober 2026 |
|---|---|---|---|---|---|---|
| S4 | loonmutaties | Klantteam Atlas | BE | Atlas | 22 oktober 2026 (approved, valid 2026-10 only) | Geldige uitzondering |
| S1 | loonmutaties | Payroll België | BE | - | 20 oktober (approved, valid 2026-10 only, #63) | Algemene regel |
| S3 | loonmutaties | Klantteam Atlas | BE | Atlas | 25 oktober (Teams chat, unconfirmed) | Niet bevestigd |
| S2 | loonmutaties | Payroll België | BE | - | 15 oktober (old, superseded by S1) | Vervangen door S1 |
| S5 | loonmutaties | Payroll België | NL | - | 18 oktober | Ander land |
| S6 | ziekmelding | Payroll België | BE | - | Binnen 24 uur | Algemene regel |
| S7 | ziekmelding | Klantteam Atlas | BE | Atlas | Binnen 48 uur (Teams chat, unconfirmed) | Niet bevestigd |
| S9 | ziekmelding | Payroll België | BE | - | Binnen 72 uur (old version, expired 2025, not yet marked superseded) | Niet geldig in deze periode |
| S8 | eindejaarspremie | Payroll België, audience also Klantteam Atlas | BE | Atlas | 15 december | Geldige uitzondering (only users in both teams see it) |

Users: **wanne** (both teams; asks the questions), **roy** (owner of both teams), **sebastien** (only Payroll België: no S3, S4, S7, S8, no client "Atlas" in the client list).
No source exists on: dertiende maand, maaltijdcheques, vakantiedagen, overuren, ziekteloon.

## Scenarios

### D1. Reliable answer, client exception wins

- **User / context:** wanne; België, klant Atlas, oktober 2026.
- **Question:** "Tot wanneer mag Atlas loonmutaties aanleveren?" (chip 1)
- **Expected tools:** `find_knowledge` (5 sources) then `assess_trust` (BE / Atlas / 2026-10) then `get_source` S4.
- **Expected status:** *Onderbouwd* (>= 80; seed gives 100). Answer: **22 oktober 2026 [S4]**.
- **Cited:** S4 (exception). **Rejected, with reason:** S1 general rule (the exception goes first), S3 not confirmed, S2 superseded by S1, S5 other country.
- **Visible in the UI:** green badge and "Onderbouwing 100/100"; five source pills, S3/S2/S5 marked off with their verdict; *Waarom niet?* with four rows; *Stappen (3)*; footer "Antwoord voor België · Atlas · Oktober 2026".

### D2. Conflicting and outdated sources

- **User / context:** wanne; België, klant Atlas, oktober 2026.
- **Question:** "Binnen welke termijn moet een ziekmelding doorgegeven worden?" (chip 2)
- **Expected tools:** same three.
- **Expected status:** *Onderbouwd*. Answer: **Binnen 24 uur [S6]**.
- **Cited / rejected:** S6 general rule; S7 (48 uur, Teams chat for Atlas) not confirmed; S9 (72 uur) not valid in this period (an old version nobody marked as replaced yet).
- **Visible:** the three values 24/48/72 are all on screen, only one supports the answer. The answer says that **no confirmed agreement for Atlas** exists and that S7 does not count, so it is not used as a client answer without confirming.
- Also D1 shows the same pattern (S1 vs S4 vs S3 vs S2).

### D3. Wrong-market source

- **D3a.** wanne; context **Nederland**, Atlas, oktober 2026; "Tot wanneer mag Atlas loonmutaties aanleveren?" Expected: *Onderbouwd*, **18 oktober [S5]** (general rule NL). Rejected: S1, S4, S3 "Ander land", S2 superseded. The same question in D1 shows S5 as "Ander land": the market decides which source applies.
- **D3b (wrong market only).** wanne; Nederland, Atlas, oktober 2026; "Binnen welke termijn moet een ziekmelding doorgegeven worden?" Expected: *Geen onderbouwd antwoord*; topic "ziekmelding" is found but S6, S9, S7 are all "Ander land". Tools: `find_knowledge` (3 sources) then `assess_trust`; no `get_source`. The UI shows the *Kennislacune* note naming the topic, and the answer says that sources for another country do not apply to the asked country.

### D4. Knowledge gap, abstain

- **User / context:** wanne; België, Atlas, oktober 2026.
- **Questions:** "Wat is de regel voor de dertiende maand?" (chip 4), "Mag ik maaltijdcheques uitbetalen?", "Hoeveel vakantiedagen heeft een werknemer?"; also with the client name in it ("Mag Atlas maaltijdcheques uitbetalen?").
- **Expected tools:** `find_knowledge` ("geen bronnen gevonden in de teams waar je toegang toe hebt") then `assess_trust` (*Geen onderbouwd antwoord*). No `get_source`, no tool errors.
- **Expected status:** *Geen onderbouwd antwoord*, no cited sources, no guess. Answer starts with "Hier is geen onderbouwd antwoord voor ...".
- **Visible:** grey badge, *Kennislacune* note, no source pills, *Stappen (2)*.
- **Regression guard:** before U3 these returned a confident *Onderbouwd* answer from an unrelated topic (a generic word such as "maand" or "uitbetalen" matched a claim, or "Atlas" matched the client). See [matching fix](#topic-matching-fix).
- **When #13 lands:** dertiende maand and maaltijdcheques get sources and these two questions stop being gap examples. Keep one question that is guaranteed to have no source (vakantiedagen today).

### D5. Access scoping: same question, two users

- **D5a.** wanne vs sebastien, België, oktober 2026, "Tot wanneer mag Atlas loonmutaties aanleveren?".
  - wanne (klant Atlas): **22 oktober 2026 [S4]**, see D1.
  - sebastien: the Atlas client is not in his client list, so the context is "Alle klanten": **20 oktober [S1]**, *Onderbouwd*, three sources (S1, S2, S5). **No trace of S3, S4 or of an Atlas agreement** in the answer, pills, *Waarom niet?* or *Stappen* ("3 bronnen (S1, S2, S5)").
  - Via the API with client "Atlas" for sebastien the answer is still S1, with the caution "ik vond geen specifieke afspraak voor klant Atlas ... Dat betekent niet dat er geen bestaat". That is the draaiboek scenario 4 wording: the absence of readable client information is not proof that there is no exception. The status badge still reads *Onderbouwd* (the general rule itself is well substantiated); the caution is in the text.
- **D5b (restricted source).** "Wanneer wordt de eindejaarspremie voor Atlas uitbetaald?" (chip 3).
  - wanne: *Onderbouwd*, **15 december [S8]** (S8 lives in Payroll België but only people in both teams may see it).
  - sebastien: *Geen onderbouwd antwoord*, "Ik vond geen bron over dit onderwerp in de teams waar je toegang toe hebt." Not a ziekmelding answer (earlier bug), not a hint that S8 exists.

### D6. Follow-up question in the same conversation

- **User / context:** wanne; België, Atlas, oktober 2026.
- **Turn 1:** "Tot wanneer mag Atlas loonmutaties aanleveren?" -> D1.
- **Turn 2:** "En voor Nederland?" Expected: the message has no subject of its own, so the tools get the previous question too (`find_knowledge` query shows "Tot wanneer ... aanleveren? En voor Nederland?"); `assess_trust` runs for **Nederland**; answer **18 oktober [S5]** with the line "Ik beoordeel dit voor Nederland in plaats van België, omdat je dat in je vraag noemt. Ik lees dit als vervolg op je vorige vraag." Footer says "Antwoord voor Nederland · Atlas · Oktober 2026".
- **Turn 3:** "En de ziekmelding?" Expected: has its own subject, so it is answered alone: D2 (S6, 24 uur).
- **Not a follow-up:** "En maaltijdcheques?" / "Mag ik maaltijdcheques uitbetalen?" stay gaps and never inherit the previous topic.
- Country and month named in the message override the selects (only country, one month or "volgende/vorige maand", an optional year; never the client). In llm mode the model does the same through `assess_trust` arguments.

### D7. Period sensitivity (October vs November 2026, #63)

- **User / context:** wanne; België, Atlas.
- **October** ("Tot wanneer mag Atlas loonmutaties aanleveren?"): D1, 22 oktober 2026.
- **November** (Periode select on november, or turn 2 "En voor november?" / "En voor volgende maand?"): *Geen onderbouwd antwoord*. S1 and S4 are "Niet geldig in deze periode", S3 not confirmed, S2 superseded, S5 other country. Tools: `find_knowledge` (5 sources), `assess_trust`; no `get_source`.
- **Visible:** answer text says the October sources "neem ik niet over voor november 2026"; five pills all off; *Kennislacune* note naming "loonmutaties"; footer "November 2026". The October date is **not** reused for November.

### D8. General rule only (no client)

- **User / context:** wanne; België, **Alle klanten**, oktober 2026; same loonmutaties question.
- **Expected:** *Onderbouwd*, **20 oktober [S1]**. S4 and S3 are "Andere klant", S2 superseded, S5 other country. Shows that the client context, not the question text, selects the exception.

### D9. The plain-AI contrast (not the chat)

- `POST /api/naive-answer` ("Gewone AI" in *Vergelijk*) is deliberately context-blind. For "Wat is de regel voor de dertiende maand?" it still returns a loonmutaties sentence (S1) while SD Trust and the chat abstain. This is the demo contrast; it is unchanged by U3.

## Checklist per answer (what "traceable" means)

1. The badge/status comes from the engine (`assess`), not from the prose.
2. Every `[Sx]` in the answer is a source the user may see; the pills show the same sources with their verdict.
3. `Stappen` lists each tool call with arguments (country/client/period actually used) and the sources it touched.
4. Rejected sources carry a reason (*Vervangen door S1*, *Ander land*, *Niet geldig in deze periode*, *Niet bevestigd*, *Andere klant*).
5. The footer names the context the answer was rated for (`result.context`).

## Topic-matching fix

`assess` (shared by `/api/ask`, `/api/check`, and the chat tools `find_knowledge` and `assess_trust`; `/api/naive-answer` keeps its own plain word overlap on purpose) used to pick a topic when a **single** question word occurred anywhere in a source's text. Now (`packages/shared/src/onderbouwing.ts`):

- Words that carry no subject are ignored: stop words, generic time/payroll words (*maand*, *jaar*, month names, *uitbetalen*, *procedure*, ...), digits, the country, and client names (the chat's client and every client of the visible sources). "Atlas" selects a client, it is not a topic.
- A word in a source's title, topic or keywords counts 1, a word that only occurs in claim/value text counts 0.5.
- A topic matches only when its evidence is at least 1 **and** more than half of the remaining subject words are backed.

Trade-off: a very chatty or English question can now abstain instead of matching on one stray word; abstaining is the safe failure. The llm path rewrites the question before `assess_trust`.

## Gaps and inputs for #13 and #18

Needed for the agreed README scenarios, not in the seed (not added here):

- **13th month (BE and NL)**, **meal vouchers (BE)**, **sick pay (NL)** and **portfolio takeover**: no sources. Wanted outcomes per C2 are low / medium / high (dertiende maand, maaltijdcheques, ziekteloon). D4 uses dertiende maand and maaltijdcheques as gap questions today; when #13 adds them, swap in another guaranteed gap.
- **A real wrong-market case where the asker's country has no source but another country does** beyond ziekmelding (D3b): more NL sources would make the wrong-market demo richer.
- **Two approved sources that contradict** (draaiboek scenario 3, the second Atlas agreement "S8" with 23 oktober). The engine ranks by verdict then score and does not detect a tie between two equally substantiated exceptions; the chat fallback prints a "Let op: ... geeft een andere waarde en geldt evenzeer" line when it happens, but the status badge stays *Onderbouwd*. Needs a decision (engine status *conflict*?) and a separate seed state, since adding it to the default seed would break D1.
- **Seed vs brondossier drift:** the seed uses other values than the dossier (old procedure 15 vs 18 oktober, Teams chat 25 vs 23 oktober), other codes (seed S1..S9 is not dossier S1..S8) and other people (Wanne/Roy/Sebastien vs Ada/Grace/Noor/Alan). Agree one set before recording the demo.
- **Access wording:** for a user without the client agreement, the badge says *Onderbouwd* for the general rule while the draaiboek asks for "kan niet bevestigen welke afspraak voor Atlas geldt". Today that nuance is in the answer text only; a status/label for "general rule, client unverifiable" would need an engine change.
- **Old version not marked superseded:** S9 (72 uur) is shown as *Niet geldig in deze periode*, not *Vervangen*; the demo step "Markeer als vervangen door S6" turns it into *Vervangen door S6* live.
- **llm mode** has not been run against these scenarios (no `ANTHROPIC_API_KEY` available); see the PR for what was and was not verified.
