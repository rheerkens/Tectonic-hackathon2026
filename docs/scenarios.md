# Scenariokaart en corpus

Uitvoering voor issues [13](https://github.com/rheerkens/Tectonic-hackathon2026/issues/13) en [18](https://github.com/rheerkens/Tectonic-hackathon2026/issues/18), 30 september 2026. Dit is beoordelingsmateriaal, geen kennisbron voor de agent.

## Afbakening

De [seed](../packages/db/src/seed.ts) bevat 32 verschillende records over 16 onderwerpen, plus het oude onbevestigde ziekmeldingrecord S34 uit de demo (code uniek sinds de hernummering op main; S9 is hier de Atlas-mailketen). De oorspronkelijke S1 tot en met S8 blijven inhoudelijk en qua toegang behouden. S9 tot en met S13 verwerken bestaand dossiermateriaal; S14 tot en met S32 zijn nieuwe fictieve procesdocumenten en gesprekken. Bestandsformaten worden niet apart geteld. De foto bij dossier S5 is context bij diezelfde bron, geen extra stem voor een besluit.

Alle nieuwe procedures zijn ontworpen werkafspraken. Ze introduceren geen wettelijke bedragen, percentages of aanspraken. S17 en S26 bevatten juist onbevestigde percentages. S29 verwijst naar de praktijkbasis P1 en P3 zonder die overheidsteksten als eigen procedure of extra seeded bron te tellen.

De app gebruikt handmatig vastgelegde velden en de tekst in `quote`. De huidige tools openen de originele pdf, docx, EML en afbeelding niet. Deze uitvoering controleert dus de seedadaptatie van het [draaiboek](draaiboek.md), niet zelfstandig documentbegrip van de vijftien oorspronkelijke dossierstukken.

## Vijf hoofdscenario's

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

De eerdere ticketvoorbeelden met 13e maand, maaltijdcheques, ziekteloon en portefeuilleovername stammen uit een ander productmodel. Hun huidige equivalenten zijn eindejaarspremie S8, S23/S24, S25/S26 en S13. Er is geen algemeen Nederlands 13emaandsrecht toegevoegd. Low/medium/high wordt niet heringevoerd: toets `verdict.kind`, geldigheid, toegang en `status`. De nieuwe procesbronnen onderbouwen geen numeriek payrollantwoord dat niet in de tekst staat.

## Tijd en toegang

Documentgeldigheid is bewust vastgezet rond de casus oktober en november 2026. De technische `createdAt` en `updatedAt` komen uit de databaseklok bij seeden. Gespreksdatums zijn casusdatums en schuiven niet mee: relatieve documentdatums zouden de novemberproef onbruikbaar maken. De bronkaart en weerkaart kunnen op de huidige maand beoordelen terwijl de vraagcontext oktober is; een andere score is dus niet automatisch een andere inhoudelijke conclusie.

S9, S10, S11, S13 en S19 staan in Klantteam Atlas. S8 blijft in Payroll België met Klantteam Atlas als aanvullende audience. De overige nieuwe bronnen zijn algemeen in Payroll België. Beoordelingsmateriaal, deze kaart en `redactie/` worden niet in `quote` of een andere kennisbron geladen.

## Uitvoering en reproduceerbaarheid

De vastgelegde [APIresultaten](brondossier/beoordeling/api-proeven.json) bevatten vragen, context, gebruiker, werkelijke antwoordtekst, broncodes, verdicts en uitgevoerde tools. Uitgangspunt: main `fc846e9`, Bun 1.4.2, eigen worktree en profiel `corpus`. Alle vragen gingen via HTTP naar `POST /api/chat`, bronzichtbaarheid via `GET /api/sources`. Elke afzonderlijke opstelling werd vers geseed; na de conflictproef en aan het eind is de standaardseed hersteld.

Start in een eigen checkout met `bun install --frozen-lockfile` en `bun run dev --profile corpus --reset-db`. Lees de URL en databaseverbinding uit `.local/corpus/runtime.json`; gebruik geen gegokte poort. De standaardseed dekt scenario 2, 4 en 5.

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

## Waargenomen resultaat en open acceptatiepunten

| Controle | Werkelijk resultaat | Beoordeling |
| --- | --- | --- |
| 1 Algemene regel | S1, 20 oktober; S2 vervangen, S5 ander land | Verwachte datum en redenen, geen productbewijs van dossiercompleetheid |
| 2 Uitzondering en parafrase | S4, 22 oktober; andere kandidaten met juiste verdicts | Seedbaseline behouden |
| 2 NL en ziekmelding BE | S5, 18 oktober; S6, binnen 24 uur | Landcontext en bestaande ziekmelding behouden |
| 3 Formeel conflict | S4, 22 oktober, status onderbouwd; S33 wordt ten onrechte “minder sterk onderbouwd” genoemd | Niet geslaagd: beide bronnen hebben dezelfde vier onderbouwingskenmerken, maar de engine kiest de eerste |
| 4 Beperkte toegang | Alleen S1, S2, S5 voor loonmutaties; algemene 20 oktober zonder voorbehoud | Toegangsfilter geslaagd, vereiste terughoudendheid niet geslaagd |
| 4 Vraag over afgeschermde S8 | Geen S8 of 15 december in antwoord of zichtbare bronlijst; wel onterecht S6 als antwoord | Geen aangetoond lek, maar trefwoordselectie geeft een irrelevant antwoord |
| 5 Expliciet november | Geen beste bron, status geen; S1 en S4 niet geldig | Verwachte onthouding |
| 5 Vervolg met context november | Geen beste bron | Alleen bewijs voor expliciete context, niet voor zelfstandig gespreksbegrip |
| 5 Vervolg met context oktober | Opnieuw S4, 22 oktober | Niet geslaagd: fallback gebruikt de laatste vraag en gegeven context, geen zelfstandig maandbegrip |
| Nieuwe inhoud | Verlof geeft S14; telewerkvergoeding geeft geen onderbouwd antwoord | Goedgekeurde procedure en eigenaarloze kennislacune bereikbaar |

Alle vastgelegde antwoorden hebben `mode: fallback`. Er was geen APIkey geconfigureerd. De tooltrace bewijst deterministische uitvoering van zoeken, beoordelen en waar passend bronlezen uit de seed. Er is geen bewijs van een echte LLMuitvoering, geen zelfstandig lezen van de oorspronkelijke documenten en geen bewijs dat bronrelaties of bevoegdheid uit proza zijn afgeleid. Voor volledige dossieracceptatie blijven die onafhankelijke proeven open.

De vragen zonder expliciete periode gebruiken de meegestuurde context oktober; het product vraagt niet zelf om verduidelijking. Score en status blijven ook bij de twee formele afspraken positief. Een simpele gewijzigde tekst zou dat fundamentele selectieprobleem niet oplossen. Deze corpuswijziging voegt daarom geen nieuwe conflictengine of gesprekslaag toe.

## Technische verificatie

`bun run check` slaagt voor de uitgangsversie en na de corpuswijziging: alle zes workspaces typechecken en de webbuild slaagt. Let op: de huidige package.json voert hierbij alleen typecheck en build uit, ondanks de ruimere omschrijving in AGENTS.md.

`bun run test` is afzonderlijk uitgevoerd: 11 geslaagd, 4 gefaald in bestaande Windowsonverenigbaarheden. Twee locktests vereisen het ontbrekende programma `sleep`; de worktreetest vergelijkt slash met backslash; de isolatietest verliest de eerste stack door de bestaande watchoudercontrole. Er zijn geen tests toegevoegd, uitgebreid of aangepast.

De standaardlauncher startte de eigen seed met 32 bronnen, maar stopte daarna door de orphancontrole. Een afzonderlijke procesproef bevestigde de oorzaak: Bun watch start op Windows een extra worker, waardoor `process.ppid` de watchwrapper is in plaats van de launcher. Voor de HTTPproeven is uitsluitend in de eigen worktree de API eenmalig zonder watch gestart; de tijdelijke wijziging in de launcher is direct hersteld en zit niet in de diff. Dit is geen geslaagde standaardlauncherproef.

Er is in deze checkout geen `test:e2e` script of bestaande browsertestsuite. Deze wijziging raakt geen UI of realtimecode. De echte app is aanvullend in de browser bekeken met de nieuwe seed, inclusief bronpaneel en expliciete contextwisselingen. Het geopende Lumipaneel meldt nog dat het een voorproefje is zonder aangesloten agent; de chatproeven zijn daarom rechtstreeks via de API uitgevoerd. Browserwaarnemingen staan bij het bewijsbestand.

De issues blijven open tot de reviewers de corpusadaptatie en de expliciete resterende beperkingen hebben beoordeeld. Deze kaart stelt niet dat alle vijf volledige dossierproeven geslaagd zijn.
