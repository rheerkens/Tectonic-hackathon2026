import { describe, expect, test } from 'bun:test';
import type { Source } from './schemas.ts';
import { assess, findIssues } from './trust.ts';

const now = Date.parse('2026-09-30T12:00:00Z');
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
let n = 0;
const src = (o: Partial<Source>): Source => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  projectId: '00000000-0000-4000-8000-000000000000',
  title: 'Doc',
  kind: 'policy',
  topic: '13th-month',
  country: 'BE',
  claim: 'Paid in December',
  content: '13th month rules',
  ownerId: 'u1',
  verifiedById: 'u1',
  flaggedOutdated: false,
  reviewedAt: daysAgo(10),
  createdAt: daysAgo(100),
  ...o,
});

describe('assess', () => {
  test('a fresh, owned, verified policy earns high confidence', () => {
    const r = assess('13th month rules?', [src({})], { country: 'BE', now });
    expect(r.answer).toBe('Paid in December');
    expect(r.level).toBe('high');
    expect(r.confidence).toBeGreaterThanOrEqual(80);
  });

  test('corroboration beats a single source', () => {
    const one = assess('13th month', [src({})], { country: 'BE', now });
    const two = assess('13th month', [src({}), src({ kind: 'expert_note' })], { country: 'BE', now });
    expect(two.confidence).toBeGreaterThan(one.confidence);
  });

  test('a conflicting source lowers confidence and is surfaced', () => {
    const r = assess('13th month', [src({}), src({ kind: 'teams_chat', claim: 'Paid in November', reviewedAt: daysAgo(5) })], { country: 'BE', now });
    expect(r.conflicts).toHaveLength(1);
    expect(r.confidence).toBeLessThan(assess('13th month', [src({})], { country: 'BE', now }).confidence);
  });

  test('sources for another market never answer', () => {
    const r = assess('13th month', [src({ country: 'NL' })], { country: 'BE', now });
    expect(r.answer).toBeNull();
    expect(r.inapplicable).toHaveLength(1);
  });

  test('an outdated, ownerless chat is low trust', () => {
    const r = assess('13th month', [src({ kind: 'teams_chat', ownerId: null, verifiedById: null, reviewedAt: daysAgo(200) })], { country: 'BE', now });
    expect(r.level).toBe('low');
    expect(r.experts).toEqual([]);
  });

  test('flagging a source as outdated zeroes its freshness', () => {
    const r = assess('13th month', [src({ flaggedOutdated: true })], { country: 'BE', now });
    expect(r.best?.trust.factors.find((f) => f.key === 'freshness')?.value).toBe(0);
  });

  test('unknown topics are a gap, not a guess', () => {
    const r = assess('parking permits', [src({})], { country: 'BE', now });
    expect(r.topic).toBeNull();
    expect(r.answer).toBeNull();
  });
});

describe('findIssues', () => {
  test('detects outdated, ownerless and conflicting knowledge', () => {
    const issues = findIssues([src({}), src({ ownerId: null, verifiedById: null, claim: 'Paid in November', reviewedAt: daysAgo(900), kind: 'wiki' })], now);
    expect(issues.map((i) => i.type).sort()).toEqual(['conflict', 'outdated', 'ownerless']);
  });
});
