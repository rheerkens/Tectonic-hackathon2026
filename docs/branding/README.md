# SDtrust visuele identiteit

![SDtrust](assets/primary.svg)

**Van kennis naar vertrouwen.**

Versie 1.0, 30 september 2026. Dit is de vaste merkset voor het SDtrust project bij de Tectonic Hackathon. Het is een eigen identiteit met een subtiele hommage aan opdrachtgever SD Worx, geen officiële huisstijl van SD Worx.

## Brandingpagina

Open [index.html](index.html) lokaal in een browser. Alle afbeeldingen en het lettertype staan in deze map, dus de pagina werkt ook zonder internet. Deel de volledige map om de pagina intact te houden. Een GitHub bestandslink toont de broncode; deze README toont de richtlijnen direct in de repo. Voor een publieke webpagina kan deze map als statische site worden gepubliceerd.

## Merkbestanden

1. [Primair logo](assets/primary.svg), donkerblauw woordmerk met gekleurd beeldmerk op een lichte achtergrond.
2. [Lichte variant](assets/reverse.svg), wit woordmerk met wit, koraal en amber in het beeldmerk, voor donkerblauw.
3. [Monochroom logo](assets/mono.svg), volledig donkerblauw.
4. [Wit logo](assets/white.svg), volledig wit, voor donkere achtergronden.
5. [Beeldmerk](assets/symbol.svg), de lens zonder woordmerk.
6. [Monochroom beeldmerk](assets/symbol-mono.svg), voor toepassingen met één inktkleur.
7. [Appicoon](assets/app.svg), de lichte lens op een afgerond donkerblauw vlak.

De SVG bestanden bevatten uitsluitend vectorvormen. Het woordmerk is omgezet naar contouren en is onafhankelijk van geïnstalleerde lettertypen. Alle varianten delen dezelfde lensgeometrie. Alleen het appicoon bevat een achtergrond. `primary.svg` en `symbol.svg` zijn de basisbestanden voor de compositie en het beeldmerk.

## Ontwerp

De open lens brengt verschillende bronnen samen rond één heldere kern. De verbonden banen staan voor samenhang, de open ruimte voor transparantie. Het beeldmerk en de lettervormen zijn rechtstreeks overgetrokken uit het [gekozen ontwerp](reference.png). De verhoudingen en onderlinge afstand blijven behouden. De rastertextuur is vervangen door egale merkkleuren; de contouren zijn gladde vectorpaden.

## Kleuren

1. Donkerblauw, `#192D46`, RGB 25, 45, 70. Hoofdkleur voor tekst en donkere vlakken.
2. Koraal, `#EE6558`, RGB 238, 101, 88. Warm merkaccent.
3. Amber, `#F3BA55`, RGB 243, 186, 85. Klein verbindend accent.
4. Ivoor, `#F8F6F1`, RGB 248, 246, 241. Rustige basis.

Gebruik donkerblauwe tekst op ivoor, koraal of amber. Gebruik wit of ivoor op donkerblauw. Gebruik geen witte gewone tekst op koraal of amber. Betrouwbaarheid en status krijgen altijd een tekstlabel; kleur alleen draagt de betekenis niet. De bestanden gebruiken sRGB. Laat een drukker een kleurproef maken voor drukwerk.

## Typografie

[Manrope](fonts/Manrope.ttf), gewicht 600 voor titels, 400 voor lopende tekst en 800 voor nadruk. Het woordmerk gebruikt de eigen lettercontouren uit het gekozen ontwerp, niet een opnieuw getypte fontvariant. Gebruik daarvoor altijd het SVG bestand. De merknaam is altijd **SDtrust**, zonder spatie. De slagzin staat los van het logo: **Van kennis naar vertrouwen.**

Het lettertype is afkomstig uit de [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/manrope) en wordt meegeleverd onder de [SIL Open Font License](fonts/OFL.txt). De SVG woordmerken hebben dit bestand niet nodig; de brandingpagina gebruikt het lokaal.

## Gebruik

1. Houd rondom het zichtbare logo minimaal een kwart van de hoogte van het beeldmerk vrij.
2. Gebruik het volledige logo vanaf 160 CSS pixels breed. Gebruik het beeldmerk of appicoon vanaf 24 CSS pixels.
3. Behoud de verhoudingen en de positie van de onderdelen.
4. Gebruik de vaste kleurvarianten, zonder effecten, rotatie of vervorming.
5. Kies een rustige achtergrond met voldoende contrast.

Voor gebruik op het web kan een bestand als gewone afbeelding worden opgenomen. Geef het logo de alternatieve tekst `SDtrust`. Is het beeldmerk uitsluitend decoratief naast dezelfde merknaam, gebruik dan een lege alternatieve tekst.

De webapp gebruikt de primaire en lichte SVG rechtstreeks uit deze map via één gedeelde `Brand` component. Ook Manrope wordt uit deze map gebundeld. Het appicoon staat als favicon in `apps/web/public/favicon.svg`; neem wijzigingen aan `assets/app.svg` ook daar over.

De app gebruikt ivoor met donkerblauwe tekst in lichte modus. Donkere modus gebruikt donkerblauwe vlakken, lichte tekst en de lichte logovariant. Koraal en amber blijven accentkleuren. Statuskleuren behouden hun eigen betekenis en tekstlabels.

## Vorm en beweging in de app

De navigatie gebruikt een donkerblauw vlak. Zoekveld en acties zijn afgerond; antwoord en bronpaneel krijgen meer vrije ruimte en zachte hoeken. Tabellen houden rustige scheidingslijnen.

Nieuwe antwoorden verschijnen in 480 milliseconden. Een geselecteerde bron komt in 400 milliseconden in beeld en de onderbouwingsbalk loopt in 650 milliseconden op. Knoppen reageren in 180 milliseconden. Alleen tijdens een lopende zoekopdracht beweegt de laadindicator. De systeemvoorkeur voor minder beweging schakelt animaties en overgangen uit, inclusief de laadindicator; de tekstuele laadmelding blijft beschikbaar.

Het profielmenu laat gebruikers direct van demowerkruimte wisselen. Een korte overgang vervangt de oude werkruimte door de nieuwe, terwijl sessie en gegevenscache per identiteit gescheiden blijven. Zonder ondersteuning voor View Transitions of met minder beweging werkt de wissel direct.

## Voorstel voor de chatassistent

[Lumi](assets/lumi.svg) is een kleine, nieuwsgierige lens met een amberkleurige antenne en een vriendelijk gezicht. Het karakter gebruikt dezelfde vier merkkleuren. Het is een voorstel voor de toekomstige assistent, geen wijziging aan het logo. De chatknop rechtsonder opent voorlopig alleen een duidelijk gemarkeerd placeholderpaneel; er is nog geen agent aangesloten.
