# Implementeer Finn zoekt mee

De gebruiker heeft **ontwerp 4, Finn zoekt mee** gekozen. Voeg deze laadweergave toe aan **Kennis zoeken**, op de plaats van het antwoord terwijl een nieuwe vraag wordt verwerkt. Dit pakket bevat het goedgekeurde ontwerp en de implementatieopdracht. De app-integratie is nog niet uitgevoerd.

De uitvoering wordt gevolgd in GitHub-issue **#86**, **Implementeer gekozen laadweergave: Finn zoekt mee (ontwerp 4)**, in `rheerkens/Tectonic-hackathon2026`.

De ontwerpen zijn gemaakt op `4c5832f`. Deze overdracht is gecontroleerd tegen `main` op `0b94ac1`. Lees bij uitvoering opnieuw de actuele code en `AGENTS.md`.

## Bekijk het gekozen ontwerp

Open de [interactieve mockup via Tailscale](http://pve-dev3.tail93a8d2.ts.net:54383/design/generation-progress/#concept-4). Kies **Opnieuw** voor de eerste stap, **Afspelen** voor het voorbeeldverloop of **Volgende stap** voor losse toestanden. Zonder fragment opent de pagina ontwerp 4. De andere vier ontwerpen blijven beschikbaar als vergelijkingsmateriaal.

De Tailscale-link werkt zolang de reviewserver op deze werkmachine draait. Open voor een blijvende lokale referentie [index.html](index.html#concept-4) vanuit de checkout. Houd de relatieve paden naar `docs/branding` intact. De pagina gebruikt geen externe fonts, services of API's.

Gebruik deze bestanden als ontwerpbron:

- [index.html](index.html): galerij, merkstijl en context rond de mockup.
- [review.css](review.css): layout, typografie, mobiele weergave en minder beweging.
- [review.js](review.js): `case 4` in `renderMockup()`, `steps()` en de Nederlandstalige voorbeeldteksten.
- [finn-thinking.png](finn-thinking.png): kopie van de bestaande statische appmascotte voor de standalone review.

## Bouw de gekozen layout in de kennis-pagina

1. Vervang de skeleton in `apps/web/src/kennis/KennisPage.tsx` door een kleine React-component voor Finn en de status van de aanvraag. Behoud `data-testid="kn-loading"` waar dat bestaande controles ondersteunt.
2. Plaats de component onder de vraag en de contextchips. Houd vraag, land, klant en periode zichtbaar en bedienbaar.
3. Toon Finn links en de status rechts op desktop. Stapel Finn boven de tekst op smalle schermen. De mockup gebruikt een illustratievak van ongeveer 200 × 220 CSS-pixels op desktop en 125 × 135 op mobiel.
4. Gebruik een lichte kaart met rustige rand, afgeronde hoeken en voldoende ruimte. Gebruik de bestaande appvariabelen voor lichte en donkere modus. De referentiekleuren zijn donkerblauw `#192D46`, koraal `#EE6558`, amber `#F3BA55` en ivoor `#F8F6F1`.
5. Gebruik het bestaande Manrope-lettertype. Neem de galerijnavigatie, afspeelknoppen, nagemaakte zijbalk en vaste Atlas-context niet over in de app.

De vier tekstlabels uit het gekozen ontwerp zijn:

1. Onderwerp herkennen.
2. Bronnen beoordelen.
3. Afspraak selecteren.
4. Antwoord samenstellen.

De voorbeeldkop tijdens het beoordelen is **Ik controleer de bronnen.** De toelichting is **We controleren land, klant, periode en onderbouwing.** Gebruik **Antwoord in opbouw** als overkoepelende status.

## Verbind de weergave met echte aanvraagstatus

`useAsk()` in `apps/web/src/lib/queries.ts` gebruikt TanStack Query met `placeholderData: (previous) => previous`. Daardoor kan `ask.data` nog bij de vorige vraag horen terwijl `ask.isFetching` al waar is. De huidige skeleton verschijnt alleen zonder resultaat. Neem die beperking niet over.

1. Onderscheid toegang laden, een nieuwe vraag verwerken, een resultaat tonen en een aanvraagfout. Toon bij het laden van toegang bijvoorbeeld **Ik controleer je toegang.** Claim op dat moment nog geen broncontrole.
2. Toon Finn voor een door de gebruiker gestarte vraag of contextwijziging die nog geen actueel resultaat heeft. Presenteer een vorig resultaat niet als antwoord op de nieuwe context. Gebruik onder meer `ask.isPlaceholderData` en de daadwerkelijk ingediende vraag om dit onderscheid te maken.
3. Behandel een achtergrondverversing voor dezelfde vraag apart. Behoud het bestaande antwoord met een korte melding dat de bronnen opnieuw worden gecontroleerd. Laat realtime-invalidaties de pagina niet steeds vervangen door een grote laadkaart.
4. Laat een snel resultaat meteen zien. Voeg geen kunstmatige wachttijd toe om de animatie of alle voorbeeldstappen af te spelen.
5. Laat bij succes het bestaande antwoord, de bronverwijzing, de score en de brontabel terugkomen. Gebruik waarden uit de API-respons. Kopieer geen vaste datum, eigenaar, broncode of score uit de mockup.
6. Behoud de bestaande `ErrorState` en retryactie. Stop de laadweergave zodra de aanvraag definitief faalt. Laat een later antwoord op een oudere vraag de nieuwe vraag niet overschrijven.
7. Behoud **Geen onderbouwd antwoord** en de bestaande gedeeltelijk onderbouwde toestanden. Een geslaagde HTTP-aanvraag betekent niet dat het antwoord onderbouwd is.

### Toon geen verzonnen voortgang

`POST /api/ask` in `apps/api/src/routes/knowledge.ts` retourneert één JSON-resultaat van `assess()`. De endpoint verstuurt geen voortgang per stap.

Implementeer daarom eerst de gekozen layout met één eerlijke actieve wachtstatus. Toon de vier labels desgewenst als uitleg onder **Zo beoordelen we je vraag**. Laat vinkjes, voltooide stappen, **Stap 2 van 4**, percentages en een precieze fase achterwege zolang daarvoor geen echte signalen beschikbaar zijn. Voor een frontendwijziging is geen nieuwe streamingendpoint nodig.

De timer van 3.200 milliseconden in `review.js` bestaat alleen voor de review. Neem die timer niet over. Als later echte fasemeldingen worden toegevoegd, definieer de contracten eerst in `packages/shared` en koppel elke melding aan de juiste aanvraag.

## Gebruik de bestaande Finn-assets

Gebruik in de app `/mascots/finn/finn-thinking.png` voor de statische weergave. Deze staat al in `apps/web/public/mascots/finn/`. Gebruik niet de sprite sheet uit `docs/design/mascot-concepts/finn/` als gewone afbeelding: die bevat meerdere Finn-figuren tegelijk.

De goedgekeurde mockup gebruikt een stilstaande Finn. Als je de bestaande `finn-thinking.gif` inzet, toon dan de PNG bij `prefers-reduced-motion: reduce` en bij pauzeren. Stop beweging zodra het wachten eindigt. Volg de [assetinstructies](../../../apps/web/public/mascots/finn/README.md). Genereer geen nieuwe mascotte en leid geen onderbouwing af uit het vinkje op Finns map.

Gebruik `aria-busy` op het resultaatgebied en één korte `role="status"`-melding. Vermijd dubbele aankondigingen met de bestaande verborgen status in `KennisPage.tsx`. Laat de toetsenbordfocus op de vraag of bediende contextchip staan. Geef een decoratieve Finn een lege alttekst wanneer de naastgelegen tekst dezelfde betekenis draagt.

## Houd de implementatie gericht

De primaire plek is `apps/web/src/kennis/KennisPage.tsx`. Voeg de benodigde stijlen toe aan een eigen componentstylesheet of aan `apps/web/src/kennis/kennis.css`.

De actieve zwevende chat is `apps/web/src/components/ProjectChat.tsx`, die onderaan `KennisPage` wordt gerenderd. Die gebruikt `packages/shared/src/project-chat.ts` met `text`, `tool`, `done` en `error`-events. Deze events zijn geen vierfasencontract voor `POST /api/ask`.

`apps/web/src/chat/Messages.tsx` bevat ook een oudere `PendingMessage` met timers. Die hoort bij `ChatPanel.tsx`, niet bij de momenteel gemonteerde `ProjectChat`. Alleen die oude component aanpassen implementeert het gekozen ontwerp niet. Een compacte chatvariant is geen onderdeel van deze opdracht; ontwerp 5 is niet gekozen.

Behoud de bestaande permissies, teamscope, contextselectie, bronbeoordeling en realtime-afhandeling. Deze opdracht vraagt geen databasewijziging of nieuw model.

## Controleer de implementatie

Voeg volgens `AGENTS.md` geen nieuwe tests of testgevallen toe. Voer de bestaande controles uit:

```sh
bun install --frozen-lockfile
bun run check
bun run test
bun run test:e2e
```

`bun run check` voert op de gecontroleerde commit typechecks en de webbuild uit. Daarom staat `bun run test` apart vermeld.

Bekijk daarna de echte app met de T3-preview. Gebruik de door de launcher vastgelegde URL uit `.local/dev/runtime.json` en presenteer een Tailscale-URL. Controleer handmatig:

- Een trage eerste aanvraag toont Finn zonder oude of vaste antwoordgegevens.
- Een snelle aanvraag wacht niet op de voorbeeldanimatie.
- Een land-, klant- of periodewijziging toont geen oud antwoord als nieuw resultaat.
- Een mislukte aanvraag geeft de bestaande foutmelding en een werkende retryactie.
- Een achtergrondverversing houdt het huidige antwoord leesbaar.
- Een bron zonder voldoende onderbouwing krijgt geen ongepast succesgebaar.
- Mobiel vanaf 320 CSS-pixels, donkere modus, toetsenbordbediening en minder beweging blijven bruikbaar.
- Wanne en Sebastien blijven alleen hun eigen toegestane bronnen zien.

Gebruik bij browserinspectie netwerkvertraging om wachten zichtbaar te maken. Voeg daarvoor geen productievertraging toe. Leg in de implementatie-PR vast welke toestanden zijn bekeken en welke bestaande controles zijn geslaagd.

## Prompt voor de implementerende agent

```text
Implementeer het gekozen ontwerp 4, 'Finn zoekt mee', in de kennis-pagina van SDtrust.
Werk aan GitHub-issue #86 in rheerkens/Tectonic-hackathon2026.

Haal eerst de laatste main op en lees AGENTS.md. Lees daarna
docs/design/generation-progress/HANDOFF.md en bekijk
docs/design/generation-progress/index.html#concept-4.

De gebruiker heeft alleen ontwerp 4 gekozen. Bouw de Finn-laadkaart onder
de vraag en contextchips in apps/web/src/kennis/KennisPage.tsx. Gebruik
de bestaande Finn-PNG en de bestaande SDtrust-stijlen. Behoud het huidige
antwoord, bronnen, context, permissies en foutafhandeling.

De mockup simuleert vier stappen. POST /api/ask geeft één eindresultaat,
zonder voortgangsevents. Gebruik daarom echte pending-, success- en
errorstatus. Neem de voorbeeldtimer, vaste Atlas-antwoorden, percentages
of onbewezen voltooide stappen niet over. Toon de proceslabels alleen als
uitleg zolang echte fasemeldingen ontbreken. Vertraag snelle antwoorden niet.

Let op useAsk().placeholderData: een vorig antwoord mag niet onder een
nieuwe context als actueel verschijnen. Onderscheid nieuwe aanvragen van
achtergrondverversingen. Houd de actieve ProjectChat intact; de oudere
PendingMessage in apps/web/src/chat/Messages.tsx is niet de primaire plek.

Maak de component responsive, bruikbaar in donkere modus en toegankelijk
met toetsenbord en prefers-reduced-motion. Voorkom dubbele live-meldingen.
Voeg geen tests toe. Run bun run check, bun run test en bun run test:e2e.
Inspecteer de echte app met de T3-preview, inclusief trage en snelle
aanvragen, contextwissel, fout met retry en achtergrondverversing.

Lever de implementatie op via de repo-workflow met een korte beschrijving,
controle-uitkomsten en een Tailscale-review-URL. De mockup en deze
overdracht staan al op main; de app-integratie is jouw opdracht.
```
