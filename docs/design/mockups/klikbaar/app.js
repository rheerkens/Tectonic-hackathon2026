// SDtrust clickable prototype: ask -> Finn checks -> answer.
// Sources, scoring and verdicts mirror packages/db/src/seed.ts and packages/shared/src/onderbouwing.ts.
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- data
const PEOPLE = { roy: 'Roy Heerkens', seb: 'Sebastien De Couvreur' };
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const SOURCES = [
  { code: 'S4', title: 'Klantafspraak Atlas', kind: 'agreement', version: 2, topic: 'loonmutaties', country: 'BE', client: 'Atlas', value: '22 oktober 2026', claim: 'Voor Atlas geldt een goedgekeurde uitzondering op de algemene aanleverdatum van 20 oktober.', quote: 'Atlas mag loonmutaties aanleveren tot en met 22 oktober 2026.', from: '2026-10-01', to: '2026-10-31', status: 'approved', owner: 'roy', approver: 'roy', traceable: true },
  { code: 'S1', title: 'Algemene procedure België', kind: 'manual', version: 5, topic: 'loonmutaties', country: 'BE', client: null, value: '20 oktober', claim: 'Loonmutaties worden uiterlijk op 20 oktober van de maand aangeleverd.', quote: 'Loonmutaties moeten uiterlijk op de 20e van de maand binnen zijn.', from: '2026-10-01', to: '2026-10-31', status: 'approved', owner: 'seb', approver: 'seb', traceable: true },
  { code: 'S9', title: 'Mailketen Atlas: verzoek en vastlegging', kind: 'chat', version: 1, topic: 'loonmutaties', country: 'BE', client: null, value: 'verwijst naar S4', claim: 'De mailketen verwijst voor de definitieve oktoberafspraak naar S4.', quote: '28 september, Roy aan Lotte en Wanne: de vastgestelde afspraak is geregistreerd als S4.', from: '2026-10-01', to: '2026-10-31', status: 'unconfirmed', owner: 'roy', approver: null, traceable: true },
  { code: 'S3', title: 'Teamsgesprek', kind: 'chat', version: 1, topic: 'loonmutaties', country: 'BE', client: 'Atlas', value: '25 oktober', claim: 'Volgens een bericht in het team mag Atlas tot 25 oktober aanleveren.', quote: 'Ik dacht dat Atlas dit keer tot de 25e mocht aanleveren?', from: '2026-10-05', to: null, status: 'unconfirmed', owner: null, approver: null, traceable: true },
  { code: 'S2', title: 'Oude procedure België', kind: 'procedure', version: 4, topic: 'loonmutaties', country: 'BE', client: null, value: '15 oktober', claim: 'Loonmutaties worden uiterlijk op 15 van de maand aangeleverd.', quote: 'Aanleveren kan tot de 15e van de maand.', from: '2024-01-01', to: '2025-12-31', status: 'superseded', supersededBy: 'S1', owner: null, approver: 'seb', traceable: true },
  { code: 'S5', title: 'Procedure Nederland', kind: 'procedure', version: 1, topic: 'loonmutaties', country: 'NL', client: null, value: '18 {maand}', claim: 'In Nederland worden loonmutaties uiterlijk op de 18e van de maand aangeleverd.', quote: 'Nederlandse klanten leveren loonmutaties aan tot de 18e.', from: '2026-01-01', to: null, status: 'approved', owner: 'seb', approver: 'seb', traceable: true },
  { code: 'S6', title: 'Procedure ziekmelding België', kind: 'procedure', version: 1, topic: 'ziekmelding', country: 'BE', client: null, value: 'Binnen 24 uur', claim: 'Een ziekmelding wordt binnen 24 uur doorgegeven aan payroll.', quote: 'Ziekmeldingen worden binnen 24 uur na de eerste ziektedag doorgegeven.', from: '2026-01-01', to: null, status: 'approved', owner: 'roy', approver: 'roy', traceable: true },
  { code: 'S7', title: 'Teamsgesprek ziekmelding', kind: 'chat', version: 1, topic: 'ziekmelding', country: 'BE', client: 'Atlas', value: 'Binnen 48 uur', claim: 'Volgens een bericht mag Atlas ziekmeldingen binnen 48 uur doorgeven.', quote: 'Atlas zei dat 48 uur ook goed is voor ziekmeldingen.', from: '2026-09-01', to: null, status: 'unconfirmed', owner: null, approver: null, traceable: true },
  { code: 'S34', title: 'Procedure ziekmelding België (oud)', kind: 'procedure', version: 1, topic: 'ziekmelding', country: 'BE', client: null, value: 'Binnen 72 uur', claim: 'Een ziekmelding wordt binnen 72 uur doorgegeven aan payroll.', quote: 'Ziekmeldingen worden binnen 72 uur na de eerste ziektedag doorgegeven.', from: '2023-01-01', to: '2025-12-31', status: 'approved', owner: 'roy', approver: 'roy', traceable: true },
  { code: 'S32', title: 'Ziekmelding Nederland: ontvangstregistratie', kind: 'procedure', version: 1, topic: 'ziekmelding', country: 'NL', client: null, value: 'Registreer op dezelfde werkdag', claim: 'De Nederlandse werkafspraak registreert een ontvangen ziekmelding op dezelfde werkdag.', quote: 'De consultant registreert op dezelfde werkdag wanneer de klantmelding is ontvangen.', from: '2026-10-01', to: '2026-10-31', status: 'approved', owner: 'roy', approver: 'roy', traceable: true },
  { code: 'S8', title: 'Afspraak Atlas: eindejaarspremie', kind: 'agreement', version: 1, topic: 'eindejaarspremie', country: 'BE', client: 'Atlas', value: '15 december', claim: 'Voor Atlas wordt de eindejaarspremie uiterlijk op 15 december uitbetaald.', quote: 'Atlas en SD Worx spreken af dat de eindejaarspremie uiterlijk op 15 december wordt uitbetaald.', from: '2026-01-01', to: null, status: 'approved', owner: 'roy', approver: 'roy', traceable: true },
];
const TOPICS = { loonmutaties: 'Loonmutaties', ziekmelding: 'Ziekmelding', eindejaarspremie: 'Eindejaarspremie' };
const CLIENTS = { Atlas: 'Atlas', ALL: 'Alle klanten' };
const COUNTRY_NAME = { BE: 'België', NL: 'Nederland' };

// ---------------------------------------------------------------- scoring (port of onderbouwing.ts)
const periodLabel = (p) => { const [y, m] = p.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function validForPeriod(s, period) {
  const [y, m] = period.split('-').map(Number);
  const start = `${period}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return s.from <= end && (s.to === null || s.to >= start);
}
function score(s, ctx) {
  const checks = [
    { label: 'Bevoegd goedgekeurd', ok: s.status === 'approved' && s.approver !== null, max: 40 },
    { label: 'Eigenaar bekend', ok: s.owner !== null, max: 20 },
    { label: 'Geldig voor deze periode', ok: validForPeriod(s, ctx.period), max: 20 },
    { label: 'Bron herleidbaar', ok: s.traceable, max: 20 },
  ];
  return { score: checks.reduce((n, c) => n + (c.ok ? c.max : 0), 0), checks };
}
function verdict(s, ctx) {
  if (s.status === 'superseded') return { kind: 'superseded', label: s.supersededBy ? `Vervangen door ${s.supersededBy}` : 'Vervangen' };
  if (s.country !== ctx.country) return { kind: 'other-country', label: 'Ander land' };
  if (s.client !== null && s.client !== ctx.client) return { kind: 'other-client', label: 'Andere klant' };
  if (!validForPeriod(s, ctx.period)) return { kind: 'expired', label: 'Niet geldig in deze periode' };
  if (s.status === 'unconfirmed' || s.approver === null) return { kind: 'unconfirmed', label: 'Niet bevestigd' };
  if (s.client !== null) return { kind: 'exception', label: 'Geldige uitzondering' };
  return { kind: 'general', label: 'Algemene regel' };
}
const RANK = { exception: 0, general: 1, unconfirmed: 2, expired: 3, superseded: 4, 'other-client': 5, 'other-country': 6 };
const TONE = { exception: 'ok', general: 'info', unconfirmed: 'warn', expired: 'neutral', superseded: 'neutral', 'other-client': 'neutral', 'other-country': 'neutral' };
const ICON = { ok: '✓', info: 'i', warn: '!', neutral: '–', bad: '✕' };
function assess(ctx) {
  const rated = SOURCES.filter((s) => s.topic === ctx.topic)
    .map((s) => ({ ...s, value: s.value.replace('{maand}', MONTHS[Number(ctx.period.slice(5)) - 1]), ob: score(s, ctx), v: verdict(s, ctx) }))
    .sort((a, b) => RANK[a.v.kind] - RANK[b.v.kind] || b.ob.score - a.ob.score);
  const best = rated.find((s) => s.v.kind === 'exception' || s.v.kind === 'general') || null;
  const status = !best ? 'geen' : best.ob.score >= 80 ? 'onderbouwd' : best.ob.score >= 50 ? 'deels' : 'onvoldoende';
  return { rated, best, status };
}
const badge = (tone, label) => `<span class="badge ${tone}"><i>${ICON[tone]}</i>${esc(label)}</span>`;

// ---------------------------------------------------------------- live understanding of the question
const L = '(?<![\\p{L}\\p{N}])', R = '(?![\\p{L}\\p{N}])';
const RULES = [
  { field: 'topic', re: `loon\\s?mutatie\\p{L}*|mutaties?`, value: () => 'loonmutaties' },
  { field: 'topic', re: `ziek\\p{L}*`, value: () => 'ziekmelding' },
  { field: 'topic', re: `eindejaars\\p{L}*|dertiende maand`, value: () => 'eindejaarspremie' },
  { field: 'client', re: `atlas`, value: () => 'Atlas' },
  { field: 'client', re: `alle klanten|elke klant|algemeen`, value: () => 'ALL' },
  { field: 'country', re: `belgi[eë]|belgisch\\p{L}*|belg`, value: () => 'BE' },
  { field: 'country', re: `nederland\\p{L}*|holland\\p{L}*`, value: () => 'NL' },
  { field: 'period', re: `volgende maand`, value: () => '2026-10' },
  { field: 'period', re: `deze maand`, value: () => '2026-09' },
  { field: 'period', re: `(${MONTHS.join('|')}|jan|feb|mrt|apr|jun|jul|aug|sept?|okt|nov|dec)(\\s+202[67])?`, value: (m) => {
    const w = m[1].toLowerCase(); const i = MONTHS.findIndex((n) => n.startsWith(w.slice(0, 3)) || (w === 'mrt' && n === 'maart'));
    return `${m[2] ? m[2].trim() : '2026'}-${String(i + 1).padStart(2, '0')}`;
  } },
];
function detect(text) {
  const found = {}, spans = [];
  for (const r of RULES) {
    const re = new RegExp(L + '(?:' + r.re + ')' + R, 'giu');
    let m;
    while ((m = re.exec(text))) {
      const inner = new RegExp('^(?:' + r.re + ')$', 'iu').exec(m[0]) || m;
      spans.push({ start: m.index, end: m.index + m[0].length, field: r.field });
      found[r.field] = r.value(inner); // the last mention wins, like a person correcting themselves
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const clean = [];
  for (const s of spans) if (!clean.length || s.start >= clean[clean.length - 1].end) clean.push(s);
  return { found, spans: clean };
}

// ---------------------------------------------------------------- Finn (sprite player driven by the manifest)
const finn = { id: null, seq: [], step: 0, frame: 0, timer: null, imgs: {} };
const canvas = $('finn'), g = canvas.getContext('2d');
const STATE_LABEL = { welcome: ['Welkom', '#2fb67a'], idle: ['Klaar', '#2fb67a'], listening: ['Leest mee', 'var(--info)'], thinking: ['Denkt na', 'var(--coral)'], asking: ['Vraagt door', '#d68a12'], answer: ['Antwoord', 'var(--info)'], verified: ['Onderbouwd', 'var(--ok)'], uncertain: ['Twijfelt', 'var(--bad)'] };
for (const [id, st] of Object.entries(FINN)) { const im = new Image(); im.src = `../../mascot-concepts/finn/${st.file}`; im.onload = () => { if (finn.id === id) draw(); }; finn.imgs[id] = im; }
function draw() {
  const st = FINN[finn.id], f = st.frames[finn.frame], im = finn.imgs[finn.id];
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!im.complete || !im.naturalWidth) return;
  const [cx, cy] = f.cell, [l, t, r, b] = f.bounds, [px, py] = f.pivot, unit = canvas.width / 512, k = 424 / f.h;
  g.imageSmoothingQuality = 'high';
  g.drawImage(im, cx + l, cy + t, r - l, b - t, (256 + (l - px) * k) * unit, (466 + (t - py) * k) * unit, (r - l) * k * unit, (b - t) * k * unit);
}
function setFinn(id, label) {
  const lab = STATE_LABEL[label || id];
  $('state').textContent = lab[0]; $('state').style.setProperty('--st', lab[1]);
  if (finn.id === id) return;
  clearTimeout(finn.timer);
  finn.id = id; const st = FINN[id];
  if (reduced) { finn.frame = st.staticFrame; draw(); return; }
  finn.seq = [...st.sequence]; finn.step = 0; finn.frame = finn.seq[0]; draw(); tick();
}
function tick() {
  const st = FINN[finn.id];
  finn.timer = setTimeout(() => {
    finn.step++;
    if (finn.step >= finn.seq.length) {
      if (st.loop) { finn.seq = [...(st.loopSequence || st.sequence)]; finn.step = 0; }
      else if (st.nextState) { const keep = $('state').textContent; setFinn(st.nextState); $('state').textContent = keep; return; }
      else return; // hold the last pose
    }
    finn.frame = finn.seq[finn.step]; draw(); tick();
  }, st.frameDurations[finn.frame] || 100);
}

// ---------------------------------------------------------------- input phase
const state = { phase: 'input', detected: {}, typingTimer: null, prevSpans: '' };
const FIELDS = ['topic', 'country', 'client', 'period'];
const ctxOf = () => Object.fromEntries(FIELDS.map((f) => [f, state.detected[f] ?? null]));
const missingOf = (c) => FIELDS.filter((f) => !c[f]);
// Finn asks for one missing piece at a time; the user answers by adding it to the question.
const ASK = {
  topic: 'Waar gaat je vraag over?',
  country: 'Gaat het om België of Nederland?',
  client: 'Is dit voor Atlas, of voor alle klanten?',
  period: 'Over welke maand gaat het?',
};
const FIELD_NAME = { topic: 'Onderwerp', country: 'Land', client: 'Klant', period: 'Periode' };
const valueLabel = (f, v) => f === 'topic' ? TOPICS[v].toLowerCase() : f === 'country' ? COUNTRY_NAME[v] : f === 'client' ? CLIENTS[v] : periodLabel(v);

function renderInput() {
  const text = $('q').value, { found, spans } = detect(text);
  state.detected = found;
  const c = ctxOf(), missing = missingOf(c);

  // mirror with highlights; newly found words flash once
  const key = spans.map((s) => `${s.field}:${text.slice(s.start, s.end).toLowerCase()}`);
  const before = new Set(state.prevSpans.split('|'));
  let html = '', at = 0;
  spans.forEach((s, i) => { html += esc(text.slice(at, s.start)) + `<span class="hl ${s.field}${before.has(key[i]) ? '' : ' fresh'}">${esc(text.slice(s.start, s.end))}</span>`; at = s.end; });
  $('mirror').innerHTML = html + esc(text.slice(at)) + (text.endsWith('\n') || !text ? ' ' : '');
  state.prevSpans = key.join('|');

  // what Finn recognised, as quiet tags next to the send button
  $('understood').innerHTML = FIELDS.filter((f) => c[f]).map((f) => `<span class="tok ${f}"><em>${FIELD_NAME[f]}</em>${esc(cap(valueLabel(f, c[f])))}</span>`).join('');
  $('send').setAttribute('aria-disabled', String(missing.length > 0 || !text.trim()));
  $('asks').textContent = !text.trim() ? 'Hoi Wanne! Wat wil je weten? Ik lees mee.' : missing.length ? ASK[missing[0]] : 'Helder! Druk op Enter, dan zoek ik het uit.';
}

function updateFinnForInput(typing) {
  const text = $('q').value.trim(), missing = missingOf(ctxOf());
  $('reading').classList.toggle('on', typing && !!text);
  if (!text) return setFinn(finn.id === 'welcome' ? 'welcome' : 'idle');
  if (typing) return setFinn('listening');
  setFinn(missing.length ? 'thinking' : 'idle', missing.length ? 'asking' : 'idle');
}

$('q').addEventListener('input', () => {
  renderInput(); updateFinnForInput(true);
  clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(() => updateFinnForInput(false), 700);
});
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
$('send').addEventListener('click', send);

// ---------------------------------------------------------------- checking phase
function send() {
  const text = $('q').value.trim(), c = ctxOf();
  if (!text || missingOf(c).length) {
    $('asks').classList.remove('shake'); void $('asks').offsetWidth; $('asks').classList.add('shake');
    return;
  }
  state.phase = 'check'; state.sentCtx = c; state.sentText = text;
  show('check');
  const now = new Date();
  $('sentAt').textContent = `Verstuurd om ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  $('sentQ').textContent = text;
  $('sentCtx').innerHTML = ctxChips(c) + '<button class="linkish small" id="cancel" style="margin-left:auto;color:#aab8cc">Annuleer</button>';
  $('cancel').onclick = () => { clearTimeout(state.checkTimer); backToInput(); };
  $('asks').innerHTML = 'Ik controleer de bronnen… Je ziet zo <b>waarom</b> het antwoord klopt, of waarom niet.';
  setFinn('thinking');
  runSteps(c);
}
const ctxChips = (c) => ['country', 'client', 'period'].map((f) => `<span class="cchip"><span>${FIELD_NAME[f]}</span>${esc(f === 'period' ? cap(periodLabel(c[f])) : valueLabel(f, c[f]))}</span>`).join('');

function runSteps(c) {
  const res = assess(c); state.result = res;
  const all = res.rated, cands = all.filter((s) => s.v.kind === 'exception' || s.v.kind === 'general'), out = all.filter((s) => !cands.includes(s));
  const exc = cands.find((s) => s.v.kind === 'exception'), gen = cands.find((s) => s.v.kind === 'general');
  const ctxText = `${valueLabel('country', c.country)} · ${valueLabel('client', c.client)} · ${periodLabel(c.period)}`;
  const steps = [
    { title: `Onderwerp herkend: <b>${TOPICS[c.topic].toLowerCase()}</b>`, sub: `${all.length} bronnen in jouw teams gaan over dit onderwerp` },
    { title: `Context toegepast: <b>${esc(ctxText)}</b>`, sub: out.length ? `${out.length} ${out.length === 1 ? 'bron valt' : 'bronnen vallen'} af, met reden` : 'Geen enkele bron valt af',
      extra: `<div class="mini">${out.map((s) => badge(TONE[s.v.kind], `${s.code} ${s.v.label}`)).join('')}</div>` },
    { title: '<b>4 checks per bron</b>: goedgekeurd, eigenaar, geldig, herleidbaar', sub: cands.length ? cands.map((s) => `${s.code} ${s.title}`).join(' en ') : 'Er blijft geen bron over om te controleren',
      doneSub: cands.length ? cands.map((s) => `${s.code}: ${s.ob.score}/100`).join(' · ') : 'Er blijft geen bron over om te controleren' },
    exc && gen ? { title: 'Uitzondering tegen algemene regel afwegen', sub: 'Een goedgekeurde klantafspraak gaat voor de algemene regel', doneSub: `${exc.code} (${exc.title}) gaat voor ${gen.code}` }
      : cands.length ? { title: 'Beste bron kiezen', sub: 'De bron die geldt met de hoogste onderbouwing', doneSub: `${cands[0].code} is de bron die hier geldt` }
      : { title: 'Antwoord bepalen', sub: 'Zonder geldige bron geeft Finn geen antwoord', doneSub: 'Geen bron is van toepassing. Finn raadt niet.', warn: true },
  ];
  const times = ['0,2 s', '0,3 s', '0,4 s', '0,1 s'];
  const paint = (active) => {
    $('steps').innerHTML = steps.map((s, i) => {
      const done = i < active, run = i === active;
      const dot = done ? `<span class="d ${s.warn ? 'w' : 'y'}">${s.warn ? '!' : '✓'}</span>` : run ? '<span class="d run"></span>' : '<span class="d todo"></span>';
      return `<div class="step${!done && !run ? ' todo' : ''}">${dot}<div>${s.title}<small>${esc(done && s.doneSub ? s.doneSub : s.sub)}</small>${done && s.extra ? s.extra : ''}</div><span class="small muted">${done ? times[i] : run ? 'bezig' : ''}</span></div>`;
    }).join('');
  };
  let i = 0; paint(0);
  const next = () => {
    i++; paint(i);
    if (i < steps.length) state.checkTimer = setTimeout(next, reduced ? 150 : 1000);
    else state.checkTimer = setTimeout(showAnswer, reduced ? 150 : 900);
  };
  state.checkTimer = setTimeout(next, reduced ? 150 : 1000);
}

// ---------------------------------------------------------------- answer phase
function fmtDate(d) { const [y, m, day] = d.split('-').map(Number); return `${day} ${MONTHS[m - 1]} ${y}`; }
function showAnswer() {
  state.phase = 'answer'; show('answer');
  const { best, rated, status } = state.result, c = state.sentCtx;
  const exc = rated.find((s) => s.v.kind === 'exception'), gen = rated.find((s) => s.v.kind === 'general');
  const STATUS = { onderbouwd: ['ok', 'Onderbouwd'], deels: ['warn', 'Deels onderbouwd'], onvoldoende: ['bad', 'Onvoldoende onderbouwd'], geen: ['bad', 'Geen onderbouwd antwoord'] };
  let card;
  if (best) {
    const validity = best.to ? `Geldig ${fmtDate(best.from)} t/m ${fmtDate(best.to)}` : `Geldig sinds ${fmtDate(best.from)}`;
    card = `<div class="card answer-card ${status} rise">
      ${badge(STATUS[status][0], `${STATUS[status][1]} · ${best.ob.score}`)}
      <div class="big">${esc(best.value)}</div>
      <div style="font-size:16px">${esc(best.claim)}</div>
      <div class="muted small" style="margin-top:6px">${validity} · Bevestigd door ${esc(PEOPLE[best.approver])}</div>
      <div class="quote">“${esc(best.quote)}”</div>
      <div class="row"><span class="small">▤ <u>${best.code} · ${esc(best.title)} · versie ${best.version}</u></span><span style="flex:1"></span>
        <span class="btn">Vraag verduidelijking</span><span class="btn primary">Bekijk bron</span></div></div>`;
  } else {
    const expired = rated.filter((s) => s.v.kind === 'expired'), otherClient = rated.filter((s) => s.v.kind === 'other-client');
    const reason = expired.length ? `Geen bron is geldig voor ${periodLabel(c.period)}. ${expired.map((s) => s.code).join(' en ')} ${expired.length === 1 ? 'geldt' : 'gelden'} in een andere periode.`
      : otherClient.length ? `Er is alleen een afspraak voor ${[...new Set(otherClient.map((s) => s.client))].join(', ')} (${otherClient.map((s) => s.code).join(', ')}).`
      : `Er is niets vastgelegd voor ${valueLabel('country', c.country)}.`;
    const ask = rated.find((s) => s.owner) || null;
    card = `<div class="card answer-card geen rise">
      ${badge('bad', 'Geen onderbouwd antwoord')}
      <div class="big" style="font-size:32px">Hier heb ik geen bron voor</div>
      <div style="font-size:16px">${esc(reason)}</div>
      <div class="muted small" style="margin-top:6px">Finn geeft liever geen antwoord dan een verouderd of ongeldig antwoord.</div>
      <div class="row" style="margin-top:14px"><span style="flex:1"></span>${ask ? `<span class="btn primary">Vraag verduidelijking aan ${esc(PEOPLE[ask.owner].split(' ')[0])}</span>` : ''}</div></div>`;
  }
  const table = `<h2>Waarom deze bron?</h2><table class="rise">
    <tr><th style="width:56px">Bron</th><th>Titel</th><th>Zegt</th><th>Beoordeling</th><th style="text-align:right">Score</th></tr>
    ${rated.map((s) => `<tr${best && s.code === best.code ? ' class="sel"' : ''}><td class="code">${s.code}</td><td>${s.kind === 'chat' ? '💬' : '▤'} ${esc(s.title)}</td><td>${esc(s.value)}</td><td>${badge(TONE[s.v.kind], s.v.label)}</td><td style="text-align:right">${best && s.code === best.code ? `<b>${s.ob.score}</b>` : s.ob.score}</td></tr>`).join('')}
  </table><div class="muted small" style="margin-top:8px">ⓘ Een geldig document is niet automatisch van toepassing. De score meet onderbouwing, niet de kans dat iets waar is.</div>`;
  $('v-answer').innerHTML = `<div class="small muted" style="margin-bottom:10px">Jouw vraag: <b style="color:var(--ink)">${esc(state.sentText)}</b> · ${esc(valueLabel('country', c.country))} · ${esc(valueLabel('client', c.client))} · ${esc(periodLabel(c.period))}</div>` + card +
    `<div class="row" style="margin-top:14px"><button class="btn" id="again">← Nieuwe vraag</button><button class="btn" id="edit">Pas context aan</button></div>`;
  $('below').innerHTML = table;
  $('again').onclick = reset; $('edit').onclick = backToInput;

  if (status === 'onderbouwd') {
    $('asks').innerHTML = exc && gen && best.code === exc.code ? `Gebaseerd op <b>${exc.code}</b>. De algemene regel (${gen.code}) wijkt hier.` : `Gebaseerd op <b>${best.code}</b>, goedgekeurd door ${esc(PEOPLE[best.approver].split(' ')[0])}.`;
    setFinn('verified');
  } else if (best) {
    $('asks').innerHTML = 'Dit antwoord rust maar <b>deels</b> op goedgekeurde bronnen. Controleer het bij de eigenaar.';
    setFinn('answer');
  } else {
    $('asks').innerHTML = 'Ik heb geen bron die hier geldt. <b>Ik raad niet</b>: vraag het de eigenaar.';
    setFinn('uncertain');
  }
}

// ---------------------------------------------------------------- navigation
const TITLES = {
  input: ['Wat wil je zeker weten?', 'Typ je vraag. Finn leest mee, markeert wat hij herkent en vraagt wat nog ontbreekt.'],
  check: ['Finn controleert je vraag', 'Elke stap is zichtbaar: welke bronnen afvallen, en waarom.'],
  answer: ['Welke afspraak geldt?', 'Het antwoord met de bron waarop het rust.'],
};
function show(phase) {
  for (const p of ['input', 'check', 'answer']) $(`v-${p}`).hidden = p !== phase;
  document.querySelector('.stage').classList.toggle('compact', phase === 'answer');
  $('title').textContent = TITLES[phase][0]; $('subtitle').textContent = TITLES[phase][1];
  $('crumbs').innerHTML = phase === 'input' ? '<b>Kennis zoeken</b>' : `Kennis zoeken / <b>${phase === 'check' ? 'Controle' : 'Antwoord'}</b>`;
  if (phase !== 'answer') $('below').innerHTML = '';
}
function backToInput() { state.phase = 'input'; show('input'); renderInput(); updateFinnForInput(false); $('q').focus(); }
function reset() { clearTimeout(state.checkTimer); state.detected = {}; state.prevSpans = ''; $('q').value = ''; backToInput(); }

// start: Finn waves once, then rests
show('input'); renderInput(); setFinn('welcome'); $('q').focus();
