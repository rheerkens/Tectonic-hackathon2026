# Scenariokaart en corpus

Uitvoering voor issues [13](https://github.com/rheerkens/Tectonic-hackathon2026/issues/13) en [18](https://github.com/rheerkens/Tectonic-hackathon2026/issues/18), 30 september 2026. Dit is beoordelingsmateriaal, geen kennisbron voor de agent.

## Afbakening

De [seed](../packages/db/src/seed.ts) bevat 33 verschillende records over 16 onderwerpen, inclusief het oude onbevestigde ziekmeldingrecord S34 uit de demo (code uniek sinds de hernummering op main; S9 is hier de Atlas-mailketen). De oorspronkelijke S1 tot en met S8 blijven inhoudelijk en qua toegang behouden. S9 tot en met S13 verwerken bestaand dossiermateriaal; S14 tot en met S32 zijn nieuwe fictieve procesdocumenten en gesprekken. Bestandsformaten worden niet apart geteld. De foto bij dossier S5 is context bij diezelfde bron, geen extra stem voor een besluit.

Alle nieuwe procedures zijn ontworpen werkafspraken. Ze introduceren geen wettelijke bedragen, percentages of aanspraken. S17 en S26 bevatten juist onbevestigde percentages. S29 verwijst naar de praktijkbasis P1 en P3 zonder die overheidsteksten als eigen procedure of extra seeded bron te tellen.

De app gebruikt handmatig vastgelegde velden en de tekst in `quote`. De huidige tools openen de originele pdf, docx, EML en afbeelding niet. Deze uitvoering controleert dus de seedadaptatie van het [draaiboek](draaiboek.md), niet zelfstandig documentbegrip van de vijftien oorspronkelijke dossierstukken.

## Actuele scenariokaart voor #18

Opnieuw uitgevoerd op main `935ccac` met Bun 1.4.2 en een vers geseede, geïsoleerde worktree op 30 september 2026. De [vastgelegde HTTPresultaten](brondossier/beoordeling/scenario-sheet-api.json) bevatten per A-nummer de exacte request, antwoordtekst, bronwaarden, verdicts en uitgevoerde tools. A1–A13 gebruiken de standaardseed; alleen A14 voegt tijdelijk S33 toe. Dit is de actuele acceptatiekaart; het oudere [bewijsbestand](brondossier/beoordeling/api-proeven.json) beschrijft een eerdere productversie.

Tenzij anders vermeld: gebruiker Wanne, klant Atlas, periode oktober 2026. Land en periode gaan expliciet mee als context; de vraagtekst hieronder is letterlijk uitgevoerd. **Onderbouwd** betekent hier een bron met sterke onderbouwing (band ≥80), geen garantie van juistheid of individueel recht. Een bron met `unconfirmed`, `expired`, `other-country` of `superseded` ondersteunt het antwoord niet, ongeacht zijn score.

| Proef | Vraag | Markt / afwijkende context | Seedbronnen en verwacht antwoord of onthouding | Vertrouwensuitleg / verwacht verdict |
| --- | --- | --- | --- | --- |
| A1 Betrouwbare klantafspraak | Tot wanneer mag Atlas loonmutaties aanleveren? | BE | **22 oktober 2026, S4**, Onderbouwd. S1, S2, S3, S5, S9–S11 blijven zichtbaar. | S4 `exception` gaat voor S1 `general`; S3/S9–S11 `unconfirmed`, S2 `superseded`, S5 `other-country`. Een voorstel of gesprek is geen akkoord. |
| A2 Tegenstrijdige berichten | Binnen welke termijn moet een ziekmelding doorgegeven worden? | BE | **Binnen 24 uur, S6**, Onderbouwd. S7 noemt 48 uur; S34 72 uur; S32 is NL. | S6 `general`; S7 `unconfirmed`, S34 `expired`, S32 `other-country`. De tekst waarschuwt dat geen bevestigde Atlasafspraak is gevonden; neem 48/72 uur niet over. Dit is geen conflict tussen twee geldige goedkeuringen. |
| A3 Ander land | Tot wanneer mag Atlas loonmutaties aanleveren? | NL | **18 oktober, S5**, Onderbouwd. | S5 `general`; Belgische bronnen `other-country`; S2 blijft `superseded`. De Belgische klantuitzondering van 22 oktober geldt niet in NL. |
| A4 Alleen verkeerd marktgebied | Hoe wordt een verlofaanvraag verwerkt? | NL | **Geen onderbouwd antwoord**; S14 en S15 gevonden. | Beide `other-country`: aanwezige Belgische kennis rechtvaardigt geen Nederlandse conclusie. |
| A5 / A6 Dertiende maand | Wat is de regel voor de dertiende maand? | A5 BE; A6 NL | **Geen onderbouwd antwoord**, geen topic of bronnen gevonden. | De seed bevat geen bron over een dertiende maand. Eindejaarspremie S8 is geen aangetoonde synoniem of vervangend antwoord. Geen aanspraak, bedrag of betaalmoment invullen. |
| A7 Maaltijdcheques | Mag ik maaltijdcheques uitbetalen? | BE | **Controleer prestaties tegen de klantregeling, S23**, Onderbouwd; S24 niet gebruiken. | S23 `general`, S24 `unconfirmed`. Het antwoord is een controleproces, geen toestemming, bedrag of individueel recht. De quote vereist bevestigde prestaties en klantregeling; de chat vermeldt de ontbrekende specifieke Atlasafspraak. |
| A8 Ziekteloon | Hoeveel ziekteloon betaal ik bij ziekte? | NL | **Verifieer contract, ziekteduur en gevalideerde regeling, S25**, Onderbouwd; geen percentage of bedrag vastgesteld. | S25 `general`, S26 `unconfirmed` (100 procent). Contract en ziekteperiode moeten eerst worden gecontroleerd. Het onderbouwde proces is geen onderbouwd numeriek loonantwoord. |
| A9 / A10 Portefeuilleovername | Hoe draag ik de portefeuille van Atlas over? | BE; A9 oktober, A10 september 2026 | A9 **Geen onderbouwd antwoord**, S13 `expired`. A10 **Dossierstand op 25 september om 09.00 uur, S13**, Onderbouwd. | S13 is slechts een historische momentopname van vóór klantoverleg, geldig op 25 september. In september toont de engine `exception` omdat de bron klantspecifiek is; de quote bewijst geen actuele volledigheid of volledige overdrachtsprocedure. Geen nieuwe besluiten uit oktober uitsluiten op basis van S13. |
| A11 Toegang beperkt | Tot wanneer mag Atlas loonmutaties aanleveren? | BE; **Sebastien**, client Atlas expliciet via API | **20 oktober, S1**, Onderbouwd met voorbehoud; alleen S1, S2, S5 over dit onderwerp zichtbaar. | S1 `general`, S2 `superseded`, S5 `other-country`. De chat zegt dat geen specifieke afspraak gevonden is, niet dat die ontbreekt. Geen verborgen Atlasbron, titel, citaat of datum noemen. In de UI heeft Sebastien geen Atlasoptie. |
| A12 Andere periode | Tot wanneer mag Atlas loonmutaties aanleveren? | BE; **november 2026** | **Geen onderbouwd antwoord**. | S1/S4/S9–S11 `expired`, S3 `unconfirmed`, S2 `superseded`, S5 `other-country`. De oktoberafspraak niet hergebruiken in november. |
| A13 Kennisgat met een notitie | Wat is de telewerkvergoeding? | BE | **Geen onderbouwd antwoord**; alleen S28 gevonden. | S28 `unconfirmed`, zonder eigenaar of herleidbare regeling. Een gevonden notitie vult het kennisgat niet. Vraag de verantwoordelijke om de regeling. |
| A14 Twee goedgekeurde datums | Tot wanneer mag Atlas loonmutaties aanleveren? | BE; standaardseed **plus tijdelijke S33** uit de SQLopstelling hieronder | Chat noemt **S4: 22 oktober 2026** en **S33: 23 oktober 2026** en zegt: “Ik kies geen definitieve waarde”. | Beide `exception`, sterk onderbouwd en zonder vervangingsrelatie. Laat Roy bevestigen welke geldt. **Beperking:** assessment blijft S4 als `best` en `onderbouwd` teruggeven; alleen de deterministische chattekst onthoudt zich. Gebruik `/api/ask` of de badge niet als bewijs dat het formele conflict opgelost is. |

### Tool calling en zichtbare productflow

Voer deze proeven uit via **POST `/api/chat`**. Alle veertien resultaten hebben `mode: fallback`: dit bewijst de deterministische toolketen, geen LLMuitvoering. Met een beste bron volgen `find_knowledge` → `assess_trust` → `get_source`; bij A4/A5/A6/A9/A12/A13 ontbreekt `get_source`. A14 leest nog S4 maar de antwoordtekst noemt en citeert beide goedgekeurde bronnen. De trace in het bewijsbestand vermeldt de daadwerkelijk gebruikte context en broncodes.

Voor een korte demo: A1 (betrouwbaar), A2 (onbevestigde tegenspraak), A3/A4 (markt), A5 (kennisgat), daarna A7/A8 (proces versus ontbrekend numeriek antwoord). Gebruik A14 alleen met de aparte wegwerpopstelling en benoem de badgebeperking. De oude Lumi-chat is momenteel niet gemount op KennisPage; de toolketen is via het APIendpoint aantoonbaar. De gewone vraagkaart gebruikt `/api/ask`, waarvan het formele conflictgedrag afwijkt. Er is voor deze documentwijziging geen browser- of LLMproef geclaimd.

## Vijf dossieropstellingen

Gebruik steeds expliciete context. Wanne heeft Payroll België en Klantteam Atlas; Roy heeft beide teams als eigenaar; Sebastien heeft alleen Payroll België. Algemene bronnen over Nederland zijn ook voor Sebastien leesbaar. Leesbaar betekent niet toepasselijk.

| Scenario | Vraag en context | Gebruiker en opstelling | Seedbronnen | Gewenste conclusie en bronreden |
| --- | --- | --- | --- | --- |
| 1 Algemene regel | Tot wanneer mag Atlas loonmutaties voor oktober 2026 aanleveren? BE, Atlas, oktober 2026 | Wanne; afzonderlijke opstelling zonder klantafspraken over loonmutaties | S1, S2, S5; S13 als historische overdrachtscontext | 20 oktober volgens S1. S2 is expliciet vervangen, S5 betreft NL. Alleen deze gecontroleerde opstelling stelt vast dat geen uitzondering bestaat. |
| 2 Goedgekeurde uitzondering | Dezelfde vraag, BE, Atlas, oktober 2026 | Wanne of Roy; standaardseed | S4, S1, S2, S3, S5, S9, S10, S11 | 22 oktober volgens S4. Goedgekeurde klantuitzondering; S1 is algemeen, S2 vervangen, S5 ander land, gesprekken en mailverwijzing zijn geen zelfstandige goedkeuring. |
| 3 Formeel conflict | Dezelfde vraag, BE, Atlas, oktober 2026 | Wanne; standaardseed plus uitsluitend hier S33 | Scenario 2 plus S33, de adaptatie van dossier S8 | Onthouden van een definitieve datum: S4 noemt 22 en S33 23 oktober, beide goedgekeurd voor dezelfde scope en periode zonder vervangingsrelatie. Roy moet het verschil laten oplossen. |
| 4 Beperkte toegang | Dezelfde vraag, BE, Atlas, oktober 2026 | Sebastien; volledige standaardseed bestaat, maar het Atlasdossier is onleesbaar | Leesbaar voor dit onderwerp: S1, S2, S5. S4, S3, S9, S10 en S11 afgeschermd. Ook seed S8 is afgeschermd via extra audience. | Hoogstens de algemene 20 oktober, met expliciet voorbehoud dat de Atlasafspraak niet kan worden bevestigd. Geen titel, citaat, datum of bestaansmelding uit afgeschermde bronnen. |
| 5 Andere periode | Tot wanneer mag Atlas loonmutaties voor november 2026 aanleveren? Ook vervolg: En voor volgende maand? | Wanne; standaardseed. Bij expliciete vraag context november; bij gesprek begint context in oktober | S1 en S4 verlopen voor november, S9 tot en met S11 eveneens; S3 onbevestigd, S2 vervangen, S5 NL | Geen onderbouwde Belgische datum voor november. Niet de oktoberuitzondering hergebruiken. Een vervolg vereist eerst correcte interpretatie van onderwerp en periode. |

Varianten binnen deze vijf scenario's: vraag 2 als “Welke aanleverdatum geldt voor de Belgische loonmutaties van Atlas in oktober?”; dezelfde vraag met NL als expliciete context; ziekmelding BE; vraag 4 naar de afgeschermde eindejaarspremie; vraag 5 zonder periode en met ongewijzigde oktobercontext. Dit zijn controles van dezelfde mechanismen, geen extra hoofdscenario's.

## Vertaalsleutel naar het brondossier

De broncodes van het [brondossier](brondossier/README.md) en de app zijn verschillende registers. Er is niets in het oorspronkelijke dossier herschreven.

| Dossier | Seed | Interpretatie |
| --- | --- | --- |
| S0 Werkafspraken | S12 | Beknopte procesadaptatie. Dossier onderscheidt Grace als beheerder en Noor als bevoegde goedkeurder; de app registreert Roy voor beide functies. Dit is een vereenvoudiging, geen bewijs van echte bevoegdheid. |
| S1 Belgische procedure | S1 | Beide noemen 20 oktober. De seed behoudt versie 5 en haar bestaande korte tekst. Het dossier heeft eigen versies en noemt ook 17.00 uur. |
| S2 Vorige Belgische procedure | S2 | Dossier: 18 oktober; seed: 15 oktober. Beide zijn expliciet vervangen door de eigen S1. De verschillende historische datums blijven zichtbaar. |
| S3 Mailwisseling | S9 | Bewerkte samenvatting van verzoek, capaciteitsadvies, vastlegging en klantaanvaarding. Seed S3 blijft het bestaande onbevestigde gesprek over 25 oktober. |
| S4 Klantafspraak | S4 | Beide noemen 22 oktober, alleen oktober. De seed blijft zonder tijdstip; het dossier noemt 17.00 uur en volledige reguliere aanlevering. De seedproef bewijst die aanvullende voorwaarden niet. |
| S5 Overlegnotities | S10 | Voorstel van 23 oktober blijft voorstel. De bordfoto dossier S9 hoort bij deze context. |
| S6 Teamsgesprek | S11 | Verkorte adaptatie met herinnering, correctie en open novembervraag. Seed S6 blijft de Belgische ziekmeldprocedure van 24 uur. |
| S7 Nederlandse procedure | S5 | Andere landcontext. Seed S7 blijft het onbevestigde gesprek over 48 uur voor ziekmelding. |
| S8 Tweede akkoord | S33, alleen scenario 3 | Seed S8 blijft de afgeschermde eindejaarspremie en wordt nooit overschreven. S33 is geen standaardseedrecord. |
| S9 Bordfoto | Context in S10 | Geen OCR of beeldbegrip uitgevoerd en niet apart geteld. |
| S10 Overdracht | S13 | Historische momentopname vóór overleg en akkoord, niet een actuele garantie dat uitzonderingen ontbreken. |
| P1 tot en met P4 | Geen zelfstandige seedrecords | Bestaande praktijkbasis blijft in het dossier. S29 is een nieuwe fictieve checklist met verwijzing naar P1 en P3. |

Dossierrollen Ada en Alan corresponderen voor toegang met Wanne en Sebastien. De bronadaptaties noemen waar passend Roy en Wanne; de oorspronkelijke fictieve gesprekspartners blijven in het dossier staan. Het dossier noemt 23 oktober als voorstel, de bestaande seed S3 noemt 25 oktober. Dat zijn twee onbevestigde berichten, geen stilzwijgend gewijzigde definitieve afspraak.

## Corpusregister

| Seed | Onderwerp en verschillende inhoud |
| --- | --- |
| S1 tot en met S5 | Algemene, vervangen, onbevestigde, klantspecifieke en Nederlandse loonmutatiebronnen |
| S6, S7, S32 | Belgische ziekmelding, onbevestigde Atlasafwijking, Nederlandse ontvangstregistratie |
| S8 | Eindejaarspremie Atlas, met extra teamvereiste |
| S9, S10, S11 | Mailketen, overlegnotulen en Teamscorrectie, elk met eigen context en gesprek |
| S12, S13 | Dossierbeheer en historische portefeuilleoverdracht |
| S14, S15 | Bevestigde verlofregistratie en onbevestigde kalenderaanname |
| S16, S17 | Controle van loonindexering en eigenaarloze notitie zonder herkomst |
| S18, S19, S20 | Belgische overurenprocedure, Atlasaanlevering, Nederlandse contractcontrole |
| S21, S22 | Vakantiegeldcontrole en expliciet vervangen checklist |
| S23, S24 | Maaltijdchequetelling en onbevestigde aanname over kalenderdagen |
| S25, S26 | Nederlandse ziektelooncontrole en onbevestigd percentage |
| S27, S28 | Onkostencontrole en ontbrekende telewerkregeling |
| S29, S30, S31 | Indiensttreding, bankrekeningwijziging en eindafrekening |

De ticketvoorbeelden met 13e maand, maaltijdcheques, ziekteloon en portefeuilleovername worden hierboven afzonderlijk getoetst. De 13e maand blijft in BE en NL een kennisgat; eindejaarspremie S8 is geen bewezen equivalent. S23/S24 en S25/S26 ondersteunen procesvragen; S13 is historische overdrachtscontext. Er is geen algemeen Nederlands 13emaandsrecht toegevoegd. Low/medium/high wordt niet heringevoerd: toets `verdict.kind`, geldigheid, toegang en `status`. De nieuwe procesbronnen onderbouwen geen numeriek payrollantwoord dat niet in de tekst staat.

## Tijd en toegang

Documentgeldigheid is bewust vastgezet rond de casus oktober en november 2026. De technische `createdAt` en `updatedAt` komen uit de databaseklok bij seeden. Gespreksdatums zijn casusdatums en schuiven niet mee: relatieve documentdatums zouden de novemberproef onbruikbaar maken. De bronkaart en weerkaart kunnen op de huidige maand beoordelen terwijl de vraagcontext oktober is; een andere score is dus niet automatisch een andere inhoudelijke conclusie.

S9, S10, S11, S13 en S19 staan in Klantteam Atlas. S8 blijft in Payroll België met Klantteam Atlas als aanvullende audience. De overige nieuwe bronnen zijn algemeen in Payroll België. Beoordelingsmateriaal, deze kaart en `redactie/` worden niet in `quote` of een andere kennisbron geladen.

## Uitvoering en reproduceerbaarheid

De oudere [APIresultaten](brondossier/beoordeling/api-proeven.json) bevatten vragen, context, gebruiker, werkelijke antwoordtekst, broncodes, verdicts en uitgevoerde tools. Uitgangspunt: main `fc846e9`, Bun 1.4.2, eigen worktree en profiel `corpus`. Alle vragen gingen via HTTP naar `POST /api/chat`, bronzichtbaarheid via `GET /api/sources`. Elke afzonderlijke opstelling werd vers geseed; na de conflictproef en aan het eind is de standaardseed hersteld.

Start in een eigen checkout met `bun install --frozen-lockfile` en `bun run dev --profile corpus --reset-db`. Lees de API-URL uit `.local/corpus/runtime.json`; gebruik geen gegokte poort. De database-URL daarin maskeert het wachtwoord. Gebruik `bun run dev:env --profile corpus` om de echte verbinding lokaal in je shell te laden; bewaar of publiceer die uitvoer niet. De standaardseed dekt scenario 2, 4 en 5.

Voor scenario 1 verwijder je uitsluitend in die wegwerpdatabase de loonmutatiebronnen buiten S1, S2 en S5:

```sql
DELETE FROM sources
WHERE topic = 'loonmutaties' AND code NOT IN ('S1', 'S2', 'S5');
```

S13 blijft historische context. Het product gebruikt die bron nog niet als een expliciet volledigheidsbewijs. Herstel de standaardseed voordat je een andere opstelling probeert.

Voor scenario 3 voeg je in dezelfde wegwerpdatabase S33 toe via de bestaande velden:

```sql
INSERT INTO sources
(code, project_id, title, kind, version, topic, keywords, country, client,
 value, claim, quote, valid_from, valid_to, status, owner_id, approved_by_id,
 traceable, superseded_by, audience_project_ids)
SELECT 'S33', project_id, 'Aanvullend akkoord Atlas', kind, version, topic,
 keywords, country, client, '23 oktober 2026',
 'Atlas mag de volledige reguliere loonmutaties voor oktober tot en met 23 oktober 2026 aanleveren.',
 'Scenarioadaptatie van dossier S8. Roy keurt voor Atlas België ontvangst van de volledige reguliere loonmutaties voor oktober 2026 op 23 oktober 2026 goed. Deze afspraak bevat geen intrekking of vervanging van S4.',
 valid_from, valid_to, status, owner_id, approved_by_id, traceable, NULL,
 audience_project_ids FROM sources WHERE code = 'S4';
```

Gebruik als HTTPbody bijvoorbeeld:

```json
{"context":{"country":"BE","client":"Atlas","period":"2026-10"},"messages":[{"role":"user","content":"Tot wanneer mag Atlas loonmutaties voor oktober 2026 aanleveren?"}]}
```

Header `x-dev-user: demo_wanne`, voor scenario 4 `demo_sebastien`. Voor scenario 5 wijzig je de periode naar `2026-11`. Bewaar voor de vervolgproef de eerdere user en assistant berichten, voeg “En voor volgende maand?” toe en controleer zowel ongewijzigde als expliciet aangepaste periode. Respecteer bij herhaling de bestaande limiet van twintig vragen per gebruiker per minuut.

Stop en reset alleen dit eigen profiel om naar de standaardseed terug te keren. Een herstart zonder reset behoudt bestaande data; de seed vult een bestaande database niet aan.

## Actuele verificatie en beperkingen

De actuele A1–A14-proeven zijn hierboven vastgelegd en gekoppeld aan [scenario-sheet-api.json](brondossier/beoordeling/scenario-sheet-api.json). De standaardseed start met 33 bronnen; S33 is na A14 verwijderd. UUIDs en runtimepoorten zijn niet nodig voor de verwachtingen: die zijn gekoppeld aan stabiele broncodes en expliciete casuscontext.

`bun run check` (alle workspaces typechecken en webbuild) en afzonderlijk `bun run test` slagen op Linux met Bun 1.4.2. Geen testbestanden toegevoegd of uitgebreid. Dit is een documentwijziging zonder UI-, realtime-, launcher- of schemawijzigingen.

De historische APIproeven op `fc846e9` rapporteerden onder meer ontbrekende terughoudendheid bij beperkte toegang, verkeerde topicselectie en ontbrekend gespreksbegrip. Die resultaten zijn geen actuele verwachtingen: A5/A6 en A11 bevestigen de huidige onthouding en waarschuwing; de [chatkaart](demo-scenarios.md) beschrijft daarnaast vervolgvragen. Het formele conflict blijft een expliciete beperking van de gedeelde assessment, hoewel de huidige chattekst zich bij A14 onthoudt. Deze documentwijziging verandert die engine niet.

De tools gebruiken seedvelden en quotes; zij openen de oorspronkelijke dossierbestanden niet en bewijzen geen documentbegrip of afleiding van bevoegdheid uit proza. De relatieve vervolgvragen uit de dossierkaart zijn in deze nieuwe A-reeks niet opnieuw uitgevoerd. Scores in het bewijsbestand zijn meetresultaten; de scenariokaart gebruikt verdicts, statussen en bereiken als acceptatiecriterium.
