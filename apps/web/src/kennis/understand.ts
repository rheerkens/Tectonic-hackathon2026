import type { Country } from '@tectonic/shared';

/**
 * What Finn reads out of a question while it is typed: which words name a topic, country, client or period.
 * Advisory only. The server still decides the topic in `assess()`; this just shows what was recognised and what is still open.
 */
export type Field = 'topic' | 'country' | 'client' | 'period';
export interface Span { start: number; end: number; field: Field }
export interface Understood {
  spans: Span[];
  topic?: string;
  country?: Country;
  /** `null` means the question says "alle klanten"; `undefined` means it names no client. */
  client?: string | null;
  period?: string;
}

/** Keyword stems per topic, built from the sources the user may see. Same 6-letter prefix match as the server. */
export type TopicIndex = Map<string, Set<string>>;

const STOP = new Set([
  'de', 'het', 'een', 'van', 'voor', 'en', 'is', 'welke', 'wat', 'hoe', 'wie', 'wanneer', 'tot', 'mag', 'moet', 'kan', 'geldt', 'op', 'aan', 'te', 'bij', 'met', 'in', 'om', 'dat', 'die', 'er', 'we', 'ik', 'ze', 'mijn', 'ons', 'ook', 'niet', 'nog', 'dit', 'deze', 'naar', 'uit', 'als', 'maar', 'dan', 'wordt', 'worden', 'zijn', 'was',
]);
const stem = (word: string) => word.toLowerCase().slice(0, 6);
const WORD = /[\p{L}\p{N}]+/gu;

export function buildTopicIndex(sources: ReadonlyArray<{ topic: string; keywords: string }>): TopicIndex {
  const index: TopicIndex = new Map();
  for (const s of sources) {
    for (const [word] of `${s.topic} ${s.keywords}`.matchAll(WORD)) {
      if (word.length < 3 || STOP.has(word.toLowerCase())) continue;
      const topics = index.get(stem(word)) ?? new Set<string>();
      topics.add(s.topic);
      index.set(stem(word), topics);
    }
  }
  return index;
}

const edge = (pattern: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'giu');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MONTH_PREFIX = ['jan', 'feb', 'maa', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTH_WORD = 'januari|februari|maart|april|mei|juni|juli|augustus|september|sept|sep|oktober|okt|november|nov|december|dec';

export function understand(text: string, ref: { clients: readonly string[]; periods: readonly string[]; topics: TopicIndex }): Understood {
  const out: Understood = { spans: [] };
  const claim = (start: number, end: number, field: Field) => {
    if (out.spans.some((s) => start < s.end && end > s.start)) return false;
    out.spans.push({ start, end, field });
    return true;
  };

  // A later mention wins, like a person correcting themselves mid-sentence: by position in the text, not by pattern order.
  const last = { client: -1, country: -1, period: -1 };
  const pick = <F extends keyof typeof last>(m: RegExpMatchArray, field: F, set: () => void) => {
    if (claim(m.index!, m.index! + m[0].length, field) && m.index! > last[field]) { last[field] = m.index!; set(); }
  };
  for (const client of ref.clients) for (const m of text.matchAll(edge(escapeRe(client)))) pick(m, 'client', () => { out.client = client; });
  for (const m of text.matchAll(edge('alle klanten|elke klant|iedere klant'))) pick(m, 'client', () => { out.client = null; });

  for (const m of text.matchAll(edge('belgi[eë]|belgisch\\p{L}*'))) pick(m, 'country', () => { out.country = 'BE'; });
  for (const m of text.matchAll(edge('nederland\\p{L}*'))) pick(m, 'country', () => { out.country = 'NL'; });

  for (const m of text.matchAll(edge(`(${MONTH_WORD})(?:\\s+(20\\d\\d))?`))) {
    const month = MONTH_PREFIX.indexOf(m[1]!.toLowerCase().slice(0, 3)) + 1;
    const period = `${m[2] ?? '2026'}-${String(month).padStart(2, '0')}`;
    if (ref.periods.includes(period)) pick(m, 'period', () => { out.period = period; });
  }

  // The topic with the most keyword hits wins; only its words are marked.
  const hits: Array<{ start: number; end: number; topics: Set<string> }> = [];
  const score = new Map<string, number>();
  for (const m of text.matchAll(WORD)) {
    const word = m[0];
    const topics = ref.topics.get(stem(word));
    if (word.length < 3 || STOP.has(word.toLowerCase()) || !topics) continue;
    hits.push({ start: m.index!, end: m.index! + word.length, topics });
    for (const t of topics) score.set(t, (score.get(t) ?? 0) + 1);
  }
  const winner = [...score].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (winner) {
    for (const h of hits) if (h.topics.has(winner)) claim(h.start, h.end, 'topic');
    out.topic = winner;
  }

  out.spans.sort((a, b) => a.start - b.start);
  return out;
}
