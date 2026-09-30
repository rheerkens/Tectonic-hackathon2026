import type {
  AskResult,
  Country,
  Expert,
  KnowledgeIssue,
  Reason,
  Source,
  SourceKind,
  SourceWithTrust,
  Trust,
  TrustFactor,
  TrustLevel,
} from './schemas.ts';
import { SOURCE_KIND_LABELS } from './schemas.ts';

/**
 * Trust is deliberately not a model output: four visible factors, fixed weights, no hidden state.
 * Every number the UI shows can be traced back to a line here.
 */
const DAY = 86_400_000;
/** Days after which a source of this kind has lost half of its freshness. */
const HALF_LIFE_DAYS: Record<SourceKind, number> = { policy: 365, manual: 540, wiki: 180, expert_note: 180, email: 90, teams_chat: 60 };
/** How much an organisation normally stands behind this kind of source. */
const AUTHORITY: Record<SourceKind, number> = { policy: 1, manual: 0.9, expert_note: 0.8, wiki: 0.6, email: 0.4, teams_chat: 0.3 };
const WEIGHTS = { freshness: 0.3, ownership: 0.2, authority: 0.2, applicability: 0.3 } as const;

export const levelOf = (score: number): TrustLevel => (score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low');

export interface TrustContext {
  /** The market the question is about; null when unknown (neutral applicability). */
  country: Country | null;
  now: number;
}

export function scoreSource(s: Source, { country, now }: TrustContext): Trust {
  const ageDays = Math.max(0, (now - Date.parse(s.reviewedAt)) / DAY);
  const freshness = s.flaggedOutdated ? 0 : 0.5 ** (ageDays / HALF_LIFE_DAYS[s.kind]);
  const ownership = s.ownerId ? (s.verifiedById ? 1 : 0.7) : 0;
  const applicability = country === null ? (s.country === 'ALL' ? 1 : 0.9) : s.country === country ? 1 : s.country === 'ALL' ? 0.8 : 0.1;

  const factors: TrustFactor[] = [
    {
      key: 'freshness',
      label: 'Up to date',
      value: freshness,
      weight: WEIGHTS.freshness,
      note: s.flaggedOutdated ? 'Flagged as outdated by a colleague' : `Last reviewed ${Math.round(ageDays)} days ago`,
    },
    {
      key: 'ownership',
      label: 'Accountable owner',
      value: ownership,
      weight: WEIGHTS.ownership,
      note: !s.ownerId ? 'Nobody owns this source' : s.verifiedById ? 'Has an owner and was verified by an expert' : 'Has an owner, not verified yet',
    },
    {
      key: 'authority',
      label: 'Source type',
      value: AUTHORITY[s.kind],
      weight: WEIGHTS.authority,
      note: `${SOURCE_KIND_LABELS[s.kind]} carries ${AUTHORITY[s.kind] >= 0.8 ? 'high' : AUTHORITY[s.kind] >= 0.5 ? 'medium' : 'low'} authority`,
    },
    {
      key: 'applicability',
      label: 'Fits this situation',
      value: applicability,
      weight: WEIGHTS.applicability,
      note:
        country === null
          ? 'No market selected'
          : s.country === country
            ? `Written for ${country}`
            : s.country === 'ALL'
              ? 'Generic, not specific to this market'
              : `Written for ${s.country}, not ${country}`,
    },
  ];
  const score = Math.round(factors.reduce((sum, f) => sum + f.value * f.weight, 0) * 100);
  return { score, level: levelOf(score), factors };
}

const factor = (t: Trust, key: TrustFactor['key']) => t.factors.find((f) => f.key === key)!.value;
const norm = (claim: string) => claim.trim().toLowerCase().replace(/\s+/g, ' ');
const withTrust = (s: Source, ctx: TrustContext): SourceWithTrust => ({ ...s, trust: scoreSource(s, ctx) });

// ---- matching a question to a topic ----------------------------------------
const STOP = new Set(['the', 'an', 'of', 'for', 'to', 'is', 'are', 'what', 'how', 'do', 'does', 'can', 'we', 'in', 'on', 'and', 'or', 'it', 'this', 'that', 'with', 'when', 'who', 'which', 'must', 'should', 'our', 'their', 'my', 'me', 'be', 'if', 'about']);
const tokens = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => w.replace(/s$/, ''));

/** Keyword overlap between the question and a source. ponytail: no embeddings; swap in vector search if the corpus outgrows keywords. */
function overlap(question: string[], s: Source): number {
  const hay = new Set(tokens(`${s.title} ${s.topic} ${s.claim} ${s.content}`));
  return question.filter((w) => hay.has(w)).length;
}

const GAP: Omit<AskResult, 'reasons' | 'experts' | 'topic' | 'inapplicable'> = {
  answer: null,
  confidence: 0,
  level: 'low',
  best: null,
  conflicts: [],
  sources: [],
};

function expertsFor(topicSources: Source[], all: Source[], country: Country): Expert[] {
  const seen = new Map<string, string>();
  for (const s of topicSources) {
    for (const id of [s.ownerId, s.verifiedById]) if (id && !seen.has(id)) seen.set(id, `Owns “${s.title}”`);
  }
  if (seen.size === 0) {
    const counts = new Map<string, number>();
    for (const s of all) if (s.ownerId && (s.country === country || s.country === 'ALL')) counts.set(s.ownerId, (counts.get(s.ownerId) ?? 0) + 1);
    for (const [id, n] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2)) seen.set(id, `Owns ${n} other ${country} source${n === 1 ? '' : 's'}`);
  }
  return [...seen].map(([userId, reason]) => ({ userId, reason }));
}

/**
 * Answers a question from the sources and explains how far the answer can be trusted.
 * The answer is the claim of the best applicable source, never generated text.
 */
export function assess(question: string, sources: Source[], ctx: { country: Country; now: number }): AskResult {
  const q = tokens(question);
  const best = new Map<string, number>();
  for (const s of sources) best.set(s.topic, Math.max(best.get(s.topic) ?? 0, overlap(q, s)));
  const [topic, hits] = [...best].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  if (!topic || hits < Math.min(2, q.length) || hits === 0) {
    return { ...GAP, topic: null, inapplicable: [], experts: [], reasons: [{ tone: 'bad', text: 'No source in this portfolio covers this question. This is a knowledge gap.' }] };
  }

  const topicSources = sources.filter((s) => s.topic === topic);
  const ranked = topicSources.map((s) => withTrust(s, ctx)).sort((a, b) => b.trust.score - a.trust.score);
  const applicable = ranked.filter((s) => factor(s.trust, 'applicability') >= 0.5);
  const inapplicable = ranked.filter((s) => factor(s.trust, 'applicability') < 0.5);
  const experts = expertsFor(topicSources, sources, ctx.country);

  const top = applicable[0];
  if (!top) {
    return {
      ...GAP,
      topic,
      inapplicable,
      experts,
      reasons: [{ tone: 'bad', text: `Sources exist for this topic, but none is written for ${ctx.country}. Do not reuse them blindly.` }],
    };
  }

  const others = applicable.slice(1);
  const conflicts = others.filter((s) => s.trust.score >= 30 && norm(s.claim) !== norm(top.claim));
  const agreeing = others.filter((s) => norm(s.claim) === norm(top.claim));
  const penalty = Math.min(40, Math.round(conflicts.reduce((sum, s) => sum + s.trust.score, 0) * 0.25));
  const bonus = Math.min(10, agreeing.length * 5);
  const single = applicable.length === 1 ? 8 : 0;
  const confidence = Math.max(0, Math.min(100, top.trust.score - penalty - single + bonus));

  const reasons: Reason[] = top.trust.factors.map((f) => ({ tone: f.value >= 0.75 ? 'good' : f.value >= 0.4 ? 'warn' : 'bad', text: f.note }));
  if (agreeing.length) reasons.push({ tone: 'good', text: `${agreeing.length} other source${agreeing.length === 1 ? '' : 's'} say the same` });
  if (conflicts.length) reasons.push({ tone: 'bad', text: `${conflicts.length} other source${conflicts.length === 1 ? '' : 's'} give a different answer` });
  if (single) reasons.push({ tone: 'warn', text: 'Only one source covers this, nothing confirms it' });
  if (inapplicable.length) reasons.push({ tone: 'warn', text: `${inapplicable.length} source${inapplicable.length === 1 ? '' : 's'} for other markets ignored` });

  return { topic, answer: top.claim, confidence, level: levelOf(confidence), reasons, best: top, conflicts, inapplicable, sources: applicable, experts };
}

/** Portfolio-wide "detect": outdated, ownerless and contradicting knowledge. */
export function findIssues(sources: Source[], now: number): KnowledgeIssue[] {
  const issues: KnowledgeIssue[] = [];
  for (const s of sources) {
    const t = scoreSource(s, { country: null, now });
    if (factor(t, 'freshness') < 0.3) issues.push({ type: 'outdated', topic: s.topic, sourceIds: [s.id], text: `“${s.title}” is outdated` });
    if (!s.ownerId) issues.push({ type: 'ownerless', topic: s.topic, sourceIds: [s.id], text: `“${s.title}” has no owner` });
  }
  const topics = [...new Set(sources.map((s) => s.topic))];
  for (const topic of topics) {
    for (const country of ['BE', 'NL'] as const) {
      const group = sources.filter((s) => s.topic === topic && (s.country === country || s.country === 'ALL'));
      const claims = new Set(group.map((s) => norm(s.claim)));
      if (claims.size > 1) issues.push({ type: 'conflict', topic, sourceIds: group.map((s) => s.id), text: `${group.length} sources on “${topic}” disagree for ${country}` });
    }
  }
  return issues;
}
