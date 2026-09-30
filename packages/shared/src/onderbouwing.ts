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

export function scoreSource(s: Source, ctx: Context): Onderbouwing {
  const checks = [
    { key: 'approved', label: 'Bevoegd goedgekeurd', ok: s.status !== 'unconfirmed' && s.approvedById !== null, max: POINTS.approved },
    { key: 'owner', label: 'Eigenaar bekend', ok: s.ownerId !== null, max: POINTS.owner },
    { key: 'valid', label: 'Geldig voor deze periode', ok: validForPeriod(s, ctx.period), max: POINTS.valid },
    { key: 'traceable', label: 'Bron herleidbaar', ok: s.traceable, max: POINTS.traceable },
  ] as const;
  const out = checks.map((c) => ({ key: c.key, label: c.label, points: c.ok ? c.max : 0, max: c.max }));
  return { score: out.reduce((sum, c) => sum + c.points, 0), checks: out };
}

/** Why does (or doesn't) this source apply to the question's context? Order matters: the first match wins. */
export function verdictFor(s: Source, ctx: Context): Verdict {
  if (s.status === 'superseded') return { kind: 'superseded', label: 'Vervangen' };
  if (s.country !== ctx.country) return { kind: 'other-country', label: 'Ander land' };
  if (s.client !== null && s.client !== ctx.client) return { kind: 'other-client', label: 'Andere klant' };
  if (!validForPeriod(s, ctx.period)) return { kind: 'expired', label: 'Niet geldig in deze periode' };
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
]);
const tokens = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
/** Prefix match, so "aanleveren" finds "aanleverdatum". ponytail: no stemming or embeddings; swap in vector search if the corpus outgrows it. */
const PREFIX = 6;
const stem = (w: string) => w.slice(0, PREFIX);

function overlap(question: string[], s: Source): number {
  const hay = new Set(tokens(`${s.title} ${s.topic} ${s.keywords} ${s.claim} ${s.value}`).map(stem));
  return question.filter((w) => hay.has(stem(w))).length;
}

const VERDICT_RANK: Record<Verdict['kind'], number> = { exception: 0, general: 1, unconfirmed: 2, expired: 3, superseded: 4, 'other-client': 5, 'other-country': 6 };

/**
 * Picks the topic that best matches the question, rates every source on that topic for the given
 * context, and chooses the answer: an applicable client-specific exception beats the general rule,
 * then the higher onderbouwing wins.
 */
export function assess(question: string, sources: Source[], projectNames: Map<string, string>, ctx: Context): AskResult {
  const q = tokens(question);
  const byTopic = new Map<string, number>();
  for (const s of sources) byTopic.set(s.topic, Math.max(byTopic.get(s.topic) ?? 0, overlap(q, s)));
  const [topic, hits] = [...byTopic].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  if (!topic || hits === 0) return { topic: null, status: 'geen', statusLabel: STATUS_LABELS.geen, best: null, sources: [] };

  const rated: AssessedSource[] = sources
    .filter((s) => s.topic === topic)
    .map((s) => ({ ...s, projectName: projectNames.get(s.projectId) ?? '', onderbouwing: scoreSource(s, ctx), verdict: verdictFor(s, ctx) }))
    .sort((a, b) => VERDICT_RANK[a.verdict.kind] - VERDICT_RANK[b.verdict.kind] || b.onderbouwing.score - a.onderbouwing.score);

  const best = rated.find((s) => s.verdict.kind === 'exception' || s.verdict.kind === 'general') ?? null;
  const status: AnswerStatus = !best ? 'geen' : best.onderbouwing.score >= 80 ? 'onderbouwd' : best.onderbouwing.score >= 50 ? 'deels' : 'onvoldoende';
  return { topic, status, statusLabel: STATUS_LABELS[status], best, sources: rated };
}

// ---- naive answer (demo contrast) ------------------------------------------
/** The claim of the source with the most keyword overlap, blind to country, client, period and status. ponytail: no LLM; add one if a key is configured. */
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
