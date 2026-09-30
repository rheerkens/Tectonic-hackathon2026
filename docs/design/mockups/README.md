# Mockups of the end result

Five static mockups of where SDtrust is heading, built from the README (§2, §3, §11, §12), the [brand kit](../../branding/README.md), the seed data and the [Finn app flow](../../app-flow.md). They mix what exists today with roadmap items (Bronnen, Experts, Capture, version history, access per source), so they are a target, not a description of `main`. All data is fictional.

| # | Screen | User need | Why it earns trust |
|---|---|---|---|
| 1 | [Antwoord met onderbouwing](01-antwoord.png) | "Which deadline applies for Atlas, in Belgium, in October?" | One answer with a literal quote, a four-check score, a verdict for every other source, a plain "Waarom je dit kunt vertrouwen" summary, and the provenance chain from mail to approval |
| 2 | [Bronpaspoort](02-bron-paspoort.png) | "Show me the actual document." | The quote is highlighted in the original, the validity clause is shown as the reason the score drops, and the page lists versions, relations to other sources, who may see it and an audit log |
| 3 | [Vergelijk met gewone AI](03-vergelijk.png) | "Why not just ask a chatbot?" | Same question, Nederland context: the plain assistant stays confidently wrong, SDtrust shows which context fields it checked and says "geen onderbouwd antwoord" when nothing applies |
| 4 | [Controleer een bericht](04-controleer-bericht.png) | "Can I forward what the client wrote in Teams?" | Each sentence is set against approved sources, the probable origin of a wrong claim is named, and a corrected reply with source codes is drafted |
| 5 | [Kennis-weerkaart, experts en aanvullen](05-weerkaart-experts.png) | "Where is our knowledge weak, and who can fix it?" | Gaps and sole experts are visible, owners get signals (waiting, disputed, expiring), and new knowledge enters as *Niet bevestigd* with a preview of its score |

## Input screen: Finn with the chat beside him

Five variants of the first screen, where the user asks the question. They all share one layout: Finn stands on the right, and the user's input is a speech bubble to his left, with its tail pointing at him. The Finn states follow [app-flow.md](../../app-flow.md).

| # | Variant | Finn state | Idea |
|---|---|---|---|
| 1 | [Welkom](input-01-welkom.png) | `welcome` | Large input with context chips inside, example questions and three trust promises underneath |
| 2 | [Gesprek](input-02-gesprek.png) | `listening` | A chat thread on the left: earlier answers carry their status and source, and the context carries over to follow-up questions. Finn shows which teams he searches |
| 3 | [Context eerst](input-03-context.png) | `thinking` (asking) | Finn highlights client, topic and period in the question and asks for the missing country before answering, with the reason |
| 4 | [Startscherm](input-04-startscherm.png) | `idle` | A smaller input with "Verder waar je was", "Veranderd sinds gisteren" and "Gevraagd in jouw team" below it |
| 5 | [Finn controleert](input-05-finn-controleert.png) | `thinking` | The moment after sending: the question locks and a live checklist shows topic, excluded sources with reasons, the four checks, and exception versus general rule |

## Clickable prototype: ask, Finn checks, answer

[`klikbaar/index.html`](klikbaar/index.html) is a clickable version of the input flow. It is plain HTML and JS with no build step, and it must be served over HTTP (for example `python3 -m http.server` from `docs/`, then open `/design/mockups/klikbaar/`).

1. **Vraag.** Finn reads along while you type. He highlights the client, topic, period and country in your sentence and shows what he recognised as tags next to the send button. Above his head he asks one plain question for the first thing still missing ("Gaat het om België of Nederland?"); you answer by adding it to your question. The send button unlocks once everything is known.
2. **Finn controleert.** The question locks into a navy bubble and four steps tick off: topic, context (with each dropped source and why), the four checks, and exception versus general rule.
3. **Antwoord.** The answer card and the "Waarom deze bron?" table. Finn plays verified, answer or uncertain depending on the status.

The answers are computed in the browser with a port of `assess()` from `packages/shared/src/onderbouwing.ts`, over 11 sources taken from the seed (S1 to S9, S32, S34). BE/Atlas/oktober gives 22 oktober, NL gives the 18th, and BE/Atlas/november gives "Geen onderbouwd antwoord". Finn is animated from the sprite manifest (`finn-data.js` is generated from `mascot-concepts/finn/manifest.json`).

Re-render the PNGs after editing the HTML with `./render.sh` (headless Chromium from the Playwright cache; set `CHROME=` to use another binary).
