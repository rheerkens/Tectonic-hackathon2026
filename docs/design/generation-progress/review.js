const concepts = [
  { title: 'Stap voor stap', description: 'Een rustige route naar een onderbouwd antwoord.', note: 'Het proces blijft op één plek. Iedere stap benoemt een controle uit de README, zonder een verzonnen percentage.' },
  { title: 'Bronnen aan het werk', description: 'Je ziet welke bron wel of niet past.', note: 'De bronnentabel vult zich tijdens de beoordeling. Een uitzondering, een oude versie en een onbevestigd bericht krijgen elk een leesbaar oordeel.' },
  { title: 'Dicht bij de bron', description: 'De afspraak en haar onderbouwing naast elkaar.', note: 'Het document krijgt de meeste ruimte. De vier controles verschijnen pas nadat de bron is beoordeeld; de score blijft tot dan verborgen.' },
  { title: 'Finn zoekt mee', description: 'Een vertrouwd gezicht bij een concreet proces.', note: 'Finn begeleidt het wachten. De bestaande mascotte blijft rustig in beeld; de tekst vertelt welke controle nu loopt.' },
  { title: 'In het gesprek', description: 'Een klein procesoverzicht in de assistent.', note: 'De assistent past naast ander werk. Het antwoord verschijnt op dezelfde plek als de voortgang, met de bron binnen handbereik.' },
];
const phases = [
  { title: 'De vraag herkennen', detail: 'We koppelen je vraag aan het onderwerp loonmutaties.', short: 'Onderwerp herkennen' },
  { title: 'Bronnen beoordelen', detail: 'We controleren land, klant, periode en onderbouwing.', short: 'Bronnen beoordelen' },
  { title: 'De juiste afspraak selecteren', detail: 'We wegen de klantafspraak af tegen de algemene procedure.', short: 'Afspraak selecteren' },
  { title: 'Het antwoord samenstellen', detail: 'We verbinden de vastgelegde afspraak aan de bron en het citaat.', short: 'Antwoord samenstellen' },
];
const sources = [
  ['S4', 'Klantafspraak Atlas', 'Geldige uitzondering', 'good'],
  ['S1', 'Algemene procedure België', 'Algemene regel', ''],
  ['S3', 'Teamsgesprek', 'Niet bevestigd', 'warn'],
  ['S2', 'Oude procedure België', 'Vervangen', ''],
  ['S5', 'Procedure Nederland', 'Ander land', ''],
];
let concept = 4;
let phase = 1;
let timer;
let playing = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const $ = (selector) => document.querySelector(selector);
function steps() {
  return `<ol class="steps">${phases.map((item, index) => `<li class="${index < phase ? 'done' : index === phase ? 'current' : ''}" ${index === phase ? 'aria-current="step"' : ''}><span class="step-icon">${index < phase ? '✓' : index + 1}</span><span>${item.short}${index === phase ? `<small>${item.detail}</small>` : ''}</span></li>`).join('')}</ol>`;
}
function status() { return '<div class="status-label busy"><span class="dot"></span> Antwoord in opbouw</div>'; }
function sourceTable() {
  return `<table class="source-table"><thead><tr><th scope="col">Bron</th><th scope="col">Document of bericht</th><th scope="col">Beoordeling</th></tr></thead><tbody>${sources.map(([code, title, verdict, kind], index) => `<tr class="${phase >= 2 && index === 0 ? 'selected' : ''}"><td><span class="source-code">${code}</span></td><td>${title}</td><td><span class="verdict ${phase >= 2 ? kind : ''}">${phase >= 2 ? verdict : phase === 1 ? index === 0 ? 'Wordt gecontroleerd' : 'Wacht op controle' : 'Nog niet beoordeeld'}</span></td></tr>`).join('')}</tbody></table>`;
}
function checks() {
  return `<ul class="checklist">${[['Bevoegd goedgekeurd', 40], ['Eigenaar bekend', 20], ['Geldig voor deze periode', 20], ['Bron herleidbaar', 20]].map(([label, points]) => `<li><span>${label}</span><span>${phase >= 2 ? `✓ ${points}` : 'Nog te controleren'}</span></li>`).join('')}</ul>`;
}
function answer(compact = false) {
  return `<div class="${compact ? '' : 'surface answer-box'}"><div class="status-label"><span class="dot"></span>Onderbouwd</div><div class="answer-value">22 oktober 2026</div><p>Voor Atlas geldt een goedgekeurde uitzondering op de algemene aanleverdatum van 20 oktober.</p><blockquote class="quote">“Atlas mag loonmutaties aanleveren tot en met 22 oktober 2026.”</blockquote><p class="tiny">Geldig voor oktober 2026. Bevestigd door Roy.</p><details class="source-detail"><summary>Bekijk bron S4 · Klantafspraak Atlas</summary><p>Versie 2. Geldig van 1 tot en met 31 oktober 2026.<br>Eigenaar: Roy. Toegang via Klantteam Atlas.</p><span class="checks-score">Onderbouwing 100 / 100</span><ul><li>Bevoegd goedgekeurd: 40 / 40</li><li>Eigenaar bekend: 20 / 20</li><li>Geldig voor deze periode: 20 / 20</li><li>Bron herleidbaar: 20 / 20</li></ul><p>De score beoordeelt de onderbouwing, niet de kans dat het antwoord waar is.</p></details></div>`;
}
function renderMockup() {
  const current = phases[Math.min(phase, 3)];
  if (concept !== 5 && phase === 4) return answer();
  switch (concept) {
    case 1: return `<div class="surface split"><div>${status()}<h3>${current.title}</h3><p>${current.detail}</p>${steps()}</div><aside class="aside-panel"><h4>Dit nemen we mee</h4><p>Alleen bronnen uit teams waartoe je toegang hebt.</p><div class="source-stub">Payroll België<small>Procedures en interne kennis</small></div><div class="source-stub">Klantteam Atlas<small>Afspraken voor deze klant</small></div><p class="footnote">Een geldig document is niet automatisch van toepassing.</p></aside></div>`;
    case 2: return `<div class="surface">${status()}<h3>${current.title}</h3><p>${current.detail}</p><span class="count">${phase === 0 ? 'Onderwerp wordt bepaald' : '5 bronnen over loonmutaties'}</span>${sourceTable()}<div class="footnote">Een geldig document is niet automatisch van toepassing.</div></div>`;
    case 3: return `<div class="surface">${status()}<h3>${current.title}</h3><p>${current.detail}</p><div class="split"><article class="paper"><span class="source-code">${phase >= 1 ? 'S4 · versie 2' : 'Bronselectie'}</span><div class="doc-heading">${phase >= 1 ? 'Klantafspraak Atlas' : 'De vraag bepaalt de bron'}</div><p>${phase >= 1 ? 'Bijzondere afspraak voor loonmutaties' : 'We zoeken naar het onderwerp dat bij je vraag past.'}</p>${phase >= 1 ? '<blockquote>“Atlas mag loonmutaties aanleveren tot en met 22 oktober 2026.”</blockquote><p>1 tot en met 31 oktober 2026</p>' : ''}</article><aside><h4 class="checks-heading">Onderbouwing van de bron</h4>${checks()}<p class="tiny">${phase >= 2 ? '100 / 100 onderbouwd. De klantafspraak geldt als uitzondering.' : 'De score volgt na de controles.'}</p></aside></div></div>`;
    case 4: return `<div class="surface finn-layout"><img class="finn-portrait" src="finn-thinking.png" alt="Finn bekijkt de bronnen"><div><div class="stage-counter">Stap ${phase + 1} van 4</div>${status()}<h3>${['Ik bekijk je vraag.', 'Ik controleer de bronnen.', 'Ik vergelijk de afspraken.', 'Ik zet de onderbouwing erbij.'][phase]}</h3><p>${current.detail}</p>${steps()}</div></div>`;
    case 5: return `<div class="chat-layout"><article class="work-document"><h3>Klantdossier Atlas</h3><p>Payroll België<br>Oktober 2026</p><div class="document-line"></div><div class="document-line"></div><div class="document-line"></div><div class="document-line"></div><p>Je dossier blijft beschikbaar<br>terwijl SDtrust de bronnen bekijkt.</p></article><section class="chat-panel" aria-label="Gesprek met Finn"><div class="chat-header"><img src="finn-thinking.png" alt=""><div>Finn van SDtrust<small>Je kennisassistent</small></div></div><div class="chat-body"><div class="user-message">Tot wanneer mag Atlas loonmutaties aanleveren?</div><div class="agent-message">${phase === 4 ? answer(true) : `${status()}<strong>${current.title}</strong><div class="chat-log">${phases.slice(0, phase + 1).map((item, index) => `<div class="${index === phase ? 'active-log' : ''}">${index < phase ? '✓' : '•'} ${item.short}</div>`).join('')}</div><span class="tiny">${current.detail}</span>`}</div></div><div class="chat-bottom">België · Atlas · Oktober 2026</div></section></div>`;
  }
}
function render() {
  const selected = concepts[concept - 1];
  $('#concept-title').textContent = `${concept}. ${selected.title}`;
  $('#concept-description').textContent = selected.description;
  $('#design-note').textContent = selected.note;
  $('#mockup').innerHTML = renderMockup();
  $('#play').textContent = playing ? 'Pauzeren' : 'Afspelen';
  $('#next').disabled = phase === 4;
  document.body.classList.toggle('paused', !playing);
  document.querySelectorAll('[data-concept]').forEach((link) => {
    if (Number(link.dataset.concept) === concept) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('#announcement').textContent = `${selected.title}. ${phase === 4 ? 'Het antwoord is onderbouwd.' : `Stap ${phase + 1} van 4. ${phases[phase].title}.`}`;
}
function stop() { clearInterval(timer); playing = false; }
function play() {
  if (playing) { stop(); render(); return; }
  if (phase === 4) phase = 0;
  playing = true;
  timer = setInterval(() => { phase += 1; if (phase >= 4) stop(); render(); }, 3200);
  render();
}
function choose() {
  const match = location.hash.match(/^#concept-([1-5])$/);
  concept = match ? Number(match[1]) : 4;
  stop(); phase = 1; render();
}
$('#play').addEventListener('click', play);
$('#next').addEventListener('click', () => { stop(); phase = Math.min(4, phase + 1); render(); });
$('#replay').addEventListener('click', () => { stop(); phase = 0; render(); });
window.addEventListener('hashchange', choose);
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { stop(); render(); } });
choose();
