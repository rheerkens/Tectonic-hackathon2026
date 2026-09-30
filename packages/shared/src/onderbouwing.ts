import type { AnswerStatus, AskResult, AssessedSource, Country, NaiveAnswer, Onderbouwing, Source, Verdict } from './schemas.ts';

/**
 * "Onderbouwing" rates how well a source is substantiated, NOT the chance that its answer is true.
 * Four visible checks with fixed points; every number in the UI traces back to this file.
 */
const POINTS = { approved: 40, owner: 20, valid: 20, traceable: 20 } as const;

export interface Context {
  country: Country;
  client: string | null;
  /** YYYY-MM */
  period: string;
}

/** Is the source in force at any moment of the period? */
export function validForPeriod(s: Pick<Source, 'validFrom' | 'validTo'>, period: string): boolean {
  const start = `${period}-01`;
  const [y, m] = period.split('-').map(Number) as [number, number];
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return s.validFrom.slice(0, 10) <= end && (s.validTo === null || s.validTo.slice(0, 10) >= start);
}

/** A source is out of the running once a newer version replaces it, whichever of the two fields says so. */
export const isSuperseded = (s: Pick<Source, 'status' | 'supersededBy'>) => s.status === 'superseded' || s.supersededBy !== null;

export function scoreSource(s: Source, ctx: Context): Onderbouwing {
  const checks = [
    { key: 'approved', label: 'Bevoegd goedgekeurd', ok: !isSuperseded(s) && !s.disputed && s.status !== 'unconfirmed' && s.approvedById !== null, max: POINTS.approved },
    { key: 'owner', label: 'Eigenaar bekend', ok: s.ownerId !== null, max: POINTS.owner },
    { key: 'valid', label: 'Geldig voor deze periode', ok: validForPeriod(s, ctx.period), max: POINTS.valid },
    { key: 'traceable', label: 'Bron herleidbaar', ok: s.traceable, max: POINTS.traceable },
  ] as const;
  const out = checks.map((c) => ({ key: c.key, label: c.label, points: c.ok ? c.max : 0, max: c.max }));
  return { score: out.reduce((sum, c) => sum + c.points, 0), checks: out };
}

/** Why does (or doesn't) this source apply to the question's context? Order matters: the first match wins. */
export function verdictFor(s: Source, ctx: Context): Verdict {
  if (isSuperseded(s)) return { kind: 'superseded', label: s.supersededBy ? `Vervangen door ${s.supersededBy}` : 'Vervangen' };
  if (s.country !== ctx.country) return { kind: 'other-country', label: 'Ander land' };
  if (s.client !== null && s.client !== ctx.client) return { kind: 'other-client', label: 'Andere klant' };
  if (!validForPeriod(s, ctx.period)) return { kind: 'expired', label: 'Niet geldig in deze periode' };
  if (s.disputed) return { kind: 'disputed', label: 'Betwist' };
  if (s.status === 'unconfirmed' || s.approvedById === null) return { kind: 'unconfirmed', label: 'Niet bevestigd' };
  if (s.client !== null) return { kind: 'exception', label: 'Geldige uitzondering' };
  return { kind: 'general', label: `Algemene regel: ${s.value}` };
}

const STATUS_LABELS: Record<AnswerStatus, string> = {
  onderbouwd: 'Onderbouwd',
  deels: 'Deels onderbouwd',
  onvoldoende: 'Onvoldoende onderbouwd',
  geen: 'Geen onderbouwd antwoord',
};

// ---- matching a question to a topic ----------------------------------------
const STOP = new Set([
  'de', 'het', 'een', 'van', 'voor', 'en', 'is', 'welke', 'wat', 'hoe', 'wie', 'wanneer', 'tot', 'mag', 'moet', 'kan', 'geldt', 'op', 'aan', 'te', 'bij', 'met', 'in', 'om', 'dat', 'die', 'er', 'we', 'ik', 'ze', 'mijn', 'ons',
  'the', 'what', 'when', 'how', 'is', 'are', 'for', 'of', 'a', 'an',
  // chatty fillers ("Kun je mij vertellen ...", "... door te geven")
  'door', 'kun', 'kunt', 'vertellen', 'weten', 'weet', 'even', 'precies', 'exact', 'geven', 'zich',
]);
/** Lower-case, accents stripped ("België" is "belgie"), split on anything that is not a letter or digit. */
const words = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').split(/[^a-z0-9]+/);
const tokens = (text: string) => words(text).filter((w) => w.length > 2 && !STOP.has(w));
/** Prefix match, so "aanleveren" finds "aanleverdatum". ponytail: no stemming or embeddings; swap in vector search if the corpus outgrows it. */
const PREFIX = 6;
const stem = (w: string) => w.slice(0, PREFIX);

function overlap(question: string[], s: Source): number {
  const hay = new Set(tokens(`${s.title} ${s.topic} ${s.keywords} ${s.claim} ${s.value}`).map(stem));
  return question.filter((w) => hay.has(stem(w))).length;
}

/**
 * Time and place: they set the period or country, never the topic. Without this, "de dertiende maand" matched
 * loonmutaties because a claim says "van de maand". Compared by stem.
 */
const CONTEXT_WORDS = new Set(
  [
    'maand', 'maanden', 'jaar', 'jaren', 'week', 'weken', 'dag', 'dagen', 'uur', 'datum', 'periode', 'volgende', 'vorige', 'deze', 'huidige',
    'januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december',
    'belgie', 'belgische', 'nederland', 'nederlandse', 'nederlands',
  ].map(stem),
);

/**
 * Words that appear in almost any payroll question or claim ("uitbetalen", "procedure", the synonyms every topic lists
 * such as "deadline" or "termijn") and say little about WHICH topic is meant: "Mag ik maaltijdcheques uitbetalen?" is
 * about maaltijdcheques, not eindejaarspremie. They only count when the question has nothing more specific
 * ("Wat is de aanleverdatum voor Atlas?"). Compared by stem.
 */
const GENERIC = new Set(
  [
    'regel', 'regels', 'procedure', 'procedures', 'afspraak', 'afspraken', 'klant', 'klanten', 'werknemer', 'werknemers',
    'termijn', 'termijnen', 'deadline', 'aanleveren', 'aanleverdatum', 'inleveren', 'doorgeven', 'doorgegeven', 'melden', 'uiterlijk',
    'uitbetalen', 'uitbetaald', 'uitbetaling', 'betalen', 'betaald', 'betaling', 'binnen', 'lang', 'snel', 'veel', 'hoeveel', 'welk', 'toepassen', 'bestellen', 'werkt', 'werken', 'heb', 'hebt', 'nodig', 'zit',
    'worden', 'wordt', 'werd', 'zijn', 'heeft', 'hebben', 'moeten', 'mogen', 'kunnen', 'niet', 'geen', 'ook', 'nog', 'naar', 'over', 'uit', 'dit', 'onze', 'alle', 'per', 'mij', 'jij', 'gelden', 'geldig', 'waarom', 'hoezo', 'dan', 'eens', 'graag',
  ].map(stem),
);

/**
 * Everyday words that name a topic without being in its keywords: "de lonen aanleveren" is loonmutaties. Exact (accent-free,
 * lower-case) words only, so "loonindexering" does not become loonmutaties. ponytail: a hand-kept list; embeddings if it grows past a screen.
 */
const SYNONYMS: Record<string, string> = {
  lonen: 'loonmutaties', salaris: 'loonmutaties', salarissen: 'loonmutaties', wedde: 'loonmutaties',
  overwerk: 'overuren', bonus: 'eindejaarspremie', eindejaarsbonus: 'eindejaarspremie',
  ontslag: 'uitdiensttreding', ontslagen: 'uitdiensttreding', aanwerving: 'indiensttreding', aanwerven: 'indiensttreding',
  kostennota: 'onkosten', onkostennota: 'onkosten', kostenvergoeding: 'onkosten', ziekteverlof: 'ziekmelding', ziektemelding: 'ziekmelding',
};

/**
 * The words of a question that carry its subject: no stop words, no generic words, no digits, and nothing that is
 * context instead of topic (time, country, the chat's client, the clients of the sources). "Atlas" selects a client, not a topic.
 * `withGeneric` keeps the generic words, for a question that has no more specific subject.
 */
export function subjectWords(question: string, sources: Array<Pick<Source, 'client'>>, ctx?: Pick<Context, 'client'>, withGeneric = false): string[] {
  const context = new Set(tokens([ctx?.client, ...sources.map((s) => s.client)].filter(Boolean).join(' ')).map(stem));
  const seen = new Set<string>();
  return tokens(question).flatMap((w) => (SYNONYMS[w] ? [w, SYNONYMS[w]] : [w])).filter((w) => {
    const k = stem(w);
    if (CONTEXT_WORDS.has(k) || (!withGeneric && GENERIC.has(k)) || context.has(k) || /^\d+$/.test(w) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * How well the sources of one topic back the subject words of the question: a word in a title, topic or keywords counts 1
 * (curated), one that only occurs in claim or value text counts 0.5 (incidental).
 */
function evidence(subject: string[], topicSources: Source[]): number {
  const curated = new Set(topicSources.flatMap((s) => tokens(`${s.title} ${s.topic} ${s.keywords}`)).map(stem));
  const prose = new Set(topicSources.flatMap((s) => tokens(`${s.claim} ${s.value}`)).map(stem));
  return subject.reduce((sum, w) => sum + (curated.has(stem(w)) ? 1 : prose.has(stem(w)) ? 0.5 : 0), 0);
}

const VERDICT_RANK: Record<Verdict['kind'], number> = { exception: 0, general: 1, disputed: 2, unconfirmed: 3, expired: 4, superseded: 5, 'other-client': 6, 'other-country': 7 };

/**
 * Picks the topic that best matches the question, rates every source on that topic for the given
 * context, and chooses the answer: an applicable client-specific exception beats the general rule,
 * then the higher onderbouwing wins. A disputed source is listed but never the answer until its owner resolves the dispute.
 */
export function assess(question: string, sources: Source[], projectNames: Map<string, string>, ctx: Context): AskResult {
  const specific = subjectWords(question, sources, ctx);
  // Only generic words ("Tot wanneer mag Atlas aanleveren?"): match on those; the rules below still ask for a curated word.
  const subject = specific.length > 0 ? specific : subjectWords(question, sources, ctx, true);
  const topics = new Map<string, Source[]>();
  for (const s of sources) topics.set(s.topic, [...(topics.get(s.topic) ?? []), s]);
  const scored = [...topics].map(([name, list]) => [name, evidence(subject, list)] as const).sort((a, b) => b[1] - a[1]);
  const [topic, hits] = scored[0] ?? [null, 0];
  // A topic needs one curated word, and more than a third of what the question is about must be backed: one stray word in a long question is not a match.
  if (!topic || hits < 1 || hits <= subject.length / 3) return { topic: null, status: 'geen', statusLabel: STATUS_LABELS.geen, best: null, sources: [] };

  const rated: AssessedSource[] = sources
    .filter((s) => s.topic === topic)
    .map((s) => ({ ...s, projectName: projectNames.get(s.projectId) ?? '', onderbouwing: scoreSource(s, ctx), verdict: verdictFor(s, ctx) }))
    .sort((a, b) => VERDICT_RANK[a.verdict.kind] - VERDICT_RANK[b.verdict.kind] || b.onderbouwing.score - a.onderbouwing.score);

  const best = rated.find((s) => s.verdict.kind === 'exception' || s.verdict.kind === 'general') ?? null;
  const status: AnswerStatus = !best ? 'geen' : best.onderbouwing.score >= 80 ? 'onderbouwd' : best.onderbouwing.score >= 50 ? 'deels' : 'onvoldoende';
  return { topic, status, statusLabel: STATUS_LABELS[status], best, sources: rated };
}

// ---- naive answer (demo contrast) ------------------------------------------
/** The claim of the source with the most keyword overlap, blind to country, client, period and status. ponytail: keyword overlap only, no LLM. */
export function naiveAnswer(question: string, sources: Source[]): NaiveAnswer {
  const q = tokens(question);
  let best: Source | null = null;
  let hits = 0;
  for (const s of sources) {
    const n = overlap(q, s);
    if (n > hits) [best, hits] = [s, n];
  }
  return best ? { answer: best.claim, source: { code: best.code, title: best.title } } : { answer: null, source: null };
}
