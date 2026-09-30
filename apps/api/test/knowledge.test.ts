import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { AskResult, ProjectSummary, SourcesOverview, SourceWithTrust } from '@tectonic/shared';
import { apiClient, startTestStack, type TestStack } from './harness.ts';

let stack: TestStack;
const as = (user: string) => apiClient(stack.baseUrl, user);
let portfolio: string;
let sources: SourceWithTrust[];

const ask = async (user: string, question: string, country = 'BE') =>
  (await as(user).post<AskResult>(`/api/projects/${portfolio}/ask`, { question, country })).body;
const sourceByTitle = (title: string) => sources.find((s) => s.title === title)!;

beforeAll(async () => {
  stack = await startTestStack();
  const projects = (await as('demo_ada').get<ProjectSummary[]>('/api/projects')).body;
  portfolio = projects.find((p) => p.name === 'Vandeputte Logistics')!.id;
  sources = (await as('demo_ada').get<SourcesOverview>(`/api/projects/${portfolio}/sources`)).body.sources;
}, 60_000);

afterAll(async () => {
  await stack.stop();
});

describe('knowledge access control', () => {
  test('non-members cannot read or query a portfolio', async () => {
    const ops = (await as('demo_margaret').get<ProjectSummary[]>('/api/projects')).body.find((p) => p.name === 'Hackathon Ops')!;
    expect((await as('demo_alan').get(`/api/projects/${ops.id}/sources`)).status).toBe(403);
    expect((await as('demo_alan').post(`/api/projects/${ops.id}/ask`, { question: 'anything', country: 'BE' })).status).toBe(403);
  });

  test('a source id from another portfolio is a 404, not data (IDOR)', async () => {
    const site = (await as('demo_ada').get<ProjectSummary[]>('/api/projects')).body.find((p) => p.name === 'Launch Website')!;
    const id = sourceByTitle('BE payroll policy: year-end bonus').id;
    expect((await as('demo_ada').post(`/api/projects/${site.id}/sources/${id}/verify`, {})).status).toBe(404);
    expect((await as('demo_ada').post(`/api/projects/${site.id}/sources/${id}/flag`, { flagged: true })).status).toBe(404);
  });

  test('only the owner of a source can verify it', async () => {
    const id = sourceByTitle('NL payroll policy: 13th month').id; // owned by Margaret
    expect((await as('demo_grace').post(`/api/projects/${portfolio}/sources/${id}/verify`, {})).status).toBe(403);
    expect((await as('demo_margaret').post(`/api/projects/${portfolio}/sources/${id}/verify`, {})).status).toBe(200);
  });

  test('ownerless sources can be adopted by the portfolio owner only', async () => {
    const id = sourceByTitle('Email: notice period rules (2012)').id;
    expect((await as('demo_grace').post(`/api/projects/${portfolio}/sources/${id}/verify`, {})).status).toBe(403);
    const adopted = (await as('demo_ada').post<SourceWithTrust>(`/api/projects/${portfolio}/sources/${id}/verify`, {})).body;
    expect(adopted.ownerId).toBe('demo_ada');
  });

  test('input is validated', async () => {
    expect((await as('demo_ada').post(`/api/projects/${portfolio}/ask`, { question: 'x', country: 'BE' })).status).toBe(400);
    expect((await as('demo_ada').post(`/api/projects/${portfolio}/ask`, { question: 'valid question', country: 'FR' })).status).toBe(400);
    expect((await as('demo_ada').post(`/api/projects/${portfolio}/sources`, { title: 't', kind: 'policy', topic: 'Bad Slug!', country: 'BE', claim: 'c' })).status).toBe(400);
  });
});

describe('trust lens answers', () => {
  test('the 13th month for BE is answered from the policy, with the disagreeing sources shown', async () => {
    const r = await ask('demo_ada', 'When is the 13th month paid?');
    expect(r.answer).toBe('Paid in December, pro rata to months worked');
    expect(r.conflicts.length).toBeGreaterThanOrEqual(2);
    expect(r.inapplicable.map((s) => s.country)).toEqual(['NL']);
    expect(r.level).not.toBe('high');
  });

  test('a knowledge gap shows low confidence and points at someone who can help', async () => {
    const r = await ask('demo_ada', 'What are the meal voucher rules?');
    expect(r.level).toBe('low');
    expect(r.experts.length).toBeGreaterThan(0);
  });

  test('flagging a source as outdated changes the answer confidence for everyone', async () => {
    const before = await ask('demo_grace', 'How does sick pay work?', 'NL');
    const id = sourceByTitle('NL policy: sick pay').id;
    await as('demo_alan').post(`/api/projects/${portfolio}/sources/${id}/flag`, { flagged: true });
    const after = await ask('demo_grace', 'How does sick pay work?', 'NL');
    expect(after.confidence).toBeLessThan(before.confidence);
  });

  test('viewers can read but not change knowledge', async () => {
    const projects = (await as('demo_margaret').get<ProjectSummary[]>('/api/projects')).body;
    const site = projects.find((p) => p.name === 'Launch Website')!; // Margaret is a viewer there
    expect((await as('demo_margaret').get(`/api/projects/${site.id}/sources`)).status).toBe(200);
    expect((await as('demo_margaret').post(`/api/projects/${site.id}/sources`, { title: 't', kind: 'policy', topic: 'abc', country: 'BE', claim: 'c' })).status).toBe(403);
  });
});
