// Comparable values in free text, so '25 okt' == '25 oktober' and '3 dagen' == '72 uur' (used by /api/check).
// ponytail: regexes for Dutch dates/durations/numbers only; no natural-language understanding, so
// 'paid in December' vs 'decemberloon' is simply "no value on either side", never a conflict.
const MONTHS = 'januari|jan|februari|feb|maart|mrt|april|apr|mei|juni|jun|juli|jul|augustus|aug|september|sept|sep|oktober|okt|november|nov|december|dec';
const MONTH_NR = ['jan', 'feb', 'maa', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const monthNr = (name: string) => MONTH_NR.indexOf(name === 'mrt' ? 'maa' : name.slice(0, 3)) + 1;

// Each pattern yields a value key and is blanked out of the text so later patterns do not re-read its digits.
const PATTERNS: Array<[RegExp, (m: string[]) => string | null]> = [
  [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => `date:${+m[3]!}-${+m[2]!}@${m[1]}`],
  [new RegExp(`\\b(\\d{1,2})(?:e|ste|de)?\\s*(${MONTHS})\\b\\.?(?:\\s+(\\d{4})\\b)?`, 'gi'), (m) => `date:${+m[1]!}-${monthNr(m[2]!.toLowerCase())}${m[3] ? `@${m[3]}` : ''}`],
  [/\b(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?\b/g, (m) => (+m[1]! <= 31 && +m[2]! >= 1 && +m[2]! <= 12 ? `date:${+m[1]!}-${+m[2]!}${m[3]?.length === 4 ? `@${m[3]}` : ''}` : null)],
  [/(\d+(?:[.,]\d+)?)\s*(uur|uren|dagen|dag)\b/gi, (m) => `hours:${parseFloat(m[1]!.replace(',', '.')) * (/^d/i.test(m[2]!) ? 24 : 1)}`],
  [/\d+(?:[.,]\d+)?/g, (m) => `number:${parseFloat(m[0]!.replace(',', '.'))}`],
];

export function extractValues(text: string): Set<string> {
  const found = new Set<string>();
  let rest = text;
  for (const [re, toKey] of PATTERNS) {
    rest = rest.replace(re, (...args) => {
      const m = args.slice(0, -2) as string[];
      const key = toKey(m);
      if (key) found.add(key);
      return key ? ' ' : m[0]!;
    });
  }
  return found;
}

// Dates are 'date:D-M' or 'date:D-M@YYYY'; years are compared only when both sides state one.
// ponytail: 2-digit years are ignored (ambiguous); a source year-less value with a validFrom/validTo window is not consulted.
const sameValue = (a: string, b: string) => {
  const [ka, ya] = a.split('@');
  const [kb, yb] = b.split('@');
  return ka === kb && (!ya || !yb || ya === yb);
};

/** True when `claim` states a value of a kind (date/hours/number) that `source` also states, but a different one. */
export function statesDifferentValue(claim: string, source: string): boolean {
  const src = extractValues(source);
  const kinds = new Set([...src].map((v) => v.split(':')[0]));
  return [...extractValues(claim)].some((v) => kinds.has(v.split(':')[0]) && ![...src].some((s) => sameValue(v, s)));
}
