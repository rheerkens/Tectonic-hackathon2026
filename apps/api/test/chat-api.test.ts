import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { projectMembers } from '@tectonic/db';
import type { Access, ChatEvent, ChatStatus, ProjectChatToolCall, ProjectChatTurn } from '@tectonic/shared';
import { CHAT_STREAM_PATH } from '@tectonic/shared';
import { and, eq } from 'drizzle-orm';
import { apiClient, startTestStack, type TestStack } from './harness.ts';
import type { ChatRunOptions } from '../src/project-chat/runner.ts';
import { createTeamTools } from '../src/project-chat/tools.ts';

let stack: TestStack;
const status: ChatStatus = { available: true, model: 'fake-chat-model' };
const tool: ProjectChatToolCall = {
  id: 'tool-1', name: 'list_sources', status: 'completed', result: 'S4: approved',
};
let blockNext: { started: () => void; wait: Promise<void> } | undefined;
let calls: ChatRunOptions[] = [];

const fakeRunner = async (options: ChatRunOptions): Promise<{ reply: string; tools: ProjectChatToolCall[] }> => {
  calls.push(options);
  if (blockNext) {
    const current = blockNext;
    blockNext = undefined;
    current.started();
    await Promise.race([
      current.wait,
      new Promise<void>((resolve) => options.signal.addEventListener('abort', () => resolve(), { once: true })),
    ]);
  }
  await options.onEvent({ type: 'text', text: 'Here is the project summary.' });
  await options.onEvent({ type: 'tool', tool });
  return { reply: 'Here is the project summary.', tools: [tool] };
};

const ada = () => apiClient(stack.baseUrl, 'demo_wanne');
const grace = () => apiClient(stack.baseUrl, 'demo_roy');
const alan = () => apiClient(stack.baseUrl, 'demo_sebastien');

async function teamByName(name: string): Promise<Access['teams'][number]> {
  const { body } = await ada().get<Access>('/api/access');
  const team = body.teams.find((item) => item.name === name);
  if (!team) throw new Error(`Seed team ${name} is missing`);
  return team;
}

function parseEvents(body: string): ChatEvent[] {
  return body.trim().split('\n').map((line) => JSON.parse(line) as ChatEvent);
}

beforeAll(async () => {
  stack = await startTestStack({ chatRunner: fakeRunner, chatStatus: async () => status });
}, 60_000);

afterAll(async () => {
  await stack.stop();
});

describe('project chat', () => {
  test('reports provider status and enforces project membership', async () => {
    const ops = await teamByName('Klantteam Atlas');
    expect(await ada().get('/api/chat/status')).toMatchObject({ status: 200, body: status });
    expect((await alan().get(`/api/projects/${ops.id}/chat`)).status).toBe(403);
    expect((await alan().post(`/api/projects/${ops.id}/chat`, { message: 'Private project?' })).status).toBe(403);
    expect((await ada().get('/api/projects/00000000-0000-4000-8000-000000000000/chat')).status).toBe(404);
  });

  test('discovers and searches across accessible teams while refusing an inaccessible team filter', async () => {
    const payroll = await teamByName('Payroll België');
    const atlas = await teamByName('Klantteam Atlas');
    const wanneTools = createTeamTools({ ctx: stack.appContext, anchorProjectId: payroll.id, userId: 'demo_wanne', allowedProjectIds: [payroll.id, atlas.id] });
    const teamsTool = wanneTools.find((candidate) => candidate.name === 'list_teams');
    const sourcesTool = wanneTools.find((candidate) => candidate.name === 'list_sources');
    if (!teamsTool || !sourcesTool) throw new Error('Expected knowledge lookup tools');

    const teamResult = await teamsTool.execute('teams-call', {}, new AbortController().signal);
    const teamText = teamResult.content.find((part) => part.type === 'text');
    expect(teamText?.type === 'text' ? teamText.text : '').toContain('Klantteam Atlas');
    const sourceResult = await sourcesTool.execute('sources-call', { query: 'loonmutaties' }, new AbortController().signal);
    const sourceText = sourceResult.content.find((part) => part.type === 'text');
    const sourceJson = sourceText?.type === 'text' ? sourceText.text : '';
    expect(sourceJson).toContain('[Klantteam Atlas / S4]');
    expect(sourceJson).toContain('[Payroll België / S1]');

    const sebastienTools = createTeamTools({ ctx: stack.appContext, anchorProjectId: payroll.id, userId: 'demo_sebastien', allowedProjectIds: [payroll.id] });
    const sebastienSearch = sebastienTools.find((candidate) => candidate.name === 'list_sources');
    if (!sebastienSearch) throw new Error('Expected source search tool');
    const accessibleOnly = await sebastienSearch.execute('sources-call', { query: 'loonmutaties' }, new AbortController().signal);
    const accessibleText = accessibleOnly.content.find((part) => part.type === 'text');
    const accessibleJson = accessibleText?.type === 'text' ? accessibleText.text : '';
    expect(accessibleJson).toContain('[Payroll België / S1]');
    expect(accessibleJson).not.toContain('[Klantteam Atlas / S4]');
    await expect(sebastienSearch.execute('forbidden-call', { teamId: atlas.id }, new AbortController().signal))
      .rejects.toThrow('Knowledge lookup failed');
  });

  test('rejects empty messages and model overrides before calling the provider', async () => {
    const site = await teamByName('Payroll België');
    const before = calls.length;
    const empty = await ada().post(`/api/projects/${site.id}/chat`, { message: '  ' });
    const override = await ada().post(`/api/projects/${site.id}/chat`, { message: 'Hi', model: 'arbitrary-model' });
    expect(empty.status).toBe(400);
    expect(override.status).toBe(400);
    expect(calls).toHaveLength(before);
  });

  test('streams text, tool, and done in order, then stores a private turn across server restart', async () => {
    calls = [];
    const site = await teamByName('Payroll België');
    const response = await fetch(`${stack.baseUrl}${CHAT_STREAM_PATH.replace(':projectId', site.id)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-user': 'demo_wanne' },
      body: JSON.stringify({ message: 'Summarize the sources' }),
    });
    expect(response.status).toBe(200);
    const events = parseEvents(await response.text());
    expect(events.map((event) => event.type)).toEqual(['text', 'tool', 'done']);
    expect(events[0]).toEqual({ type: 'text', text: 'Here is the project summary.' });
    expect(events[1]).toEqual({ type: 'tool', tool });
    const done = events[2];
    if (done?.type !== 'done') throw new Error('Expected final done event');
    expect(done.turn).toMatchObject({ message: 'Summarize the sources', reply: 'Here is the project summary.', tools: [tool], status: 'completed' });
    expect(calls[0]?.history).toEqual([]);

    const adaHistory = await ada().get<ProjectChatTurn[]>(`/api/projects/${site.id}/chat`);
    expect(adaHistory.body).toHaveLength(1);
    expect(adaHistory.body[0]?.id).toBe(done.turn.id);
    expect((await grace().get<ProjectChatTurn[]>(`/api/projects/${site.id}/chat`)).body).toEqual([]);
    await fetch(`${stack.baseUrl}/api/projects/${site.id}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-user': 'demo_roy' },
      body: JSON.stringify({ message: 'Roy asks separately' }),
    }).then((result) => result.text());
    expect(calls.at(-1)?.history).toEqual([]);
    expect((await grace().get<ProjectChatTurn[]>(`/api/projects/${site.id}/chat`)).body[0]?.message).toBe('Roy asks separately');

    await stack.restartServer();
    expect((await ada().get<ProjectChatTurn[]>(`/api/projects/${site.id}/chat`)).body[0]?.message).toBe('Summarize the sources');
  }, 30_000);

  test('keeps concurrent requests to one private conversation from overlapping', async () => {
    const site = await teamByName('Payroll België');
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    blockNext = { started: () => started(), wait: new Promise<void>((resolve) => { release = resolve; }) };
    const firstPromise = fetch(`${stack.baseUrl}/api/projects/${site.id}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-user': 'demo_wanne' },
      body: JSON.stringify({ message: 'Hold this response' }),
    });
    await startedPromise;
    const second = await ada().post<{ error: { code: string } }>(`/api/projects/${site.id}/chat`, { message: 'Overlap' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('conflict');
    release();
    await (await firstPromise).text();
  }, 30_000);

  test('rechecks membership before saving a reply', async () => {
    const site = await teamByName('Klantteam Atlas');
    await stack.handle.db.insert(projectMembers).values({ projectId: site.id, userId: 'demo_sebastien', role: 'editor' }).onConflictDoNothing();
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    blockNext = {
      started: () => started(),
      wait: new Promise<void>((resolve) => { release = resolve; }),
    };
    const request = fetch(`${stack.baseUrl}/api/projects/${site.id}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-user': 'demo_sebastien' },
      body: JSON.stringify({ message: 'Check my membership before saving' }),
    });
    await startedPromise;
    await stack.handle.db.delete(projectMembers).where(and(eq(projectMembers.projectId, site.id), eq(projectMembers.userId, 'demo_sebastien')));
    release();
    const response = await request;
    const events = parseEvents(await response.text());
    expect(events.at(-1)).toMatchObject({ type: 'error', message: 'The conversation could not be saved. Check your project access and try again.' });
    expect((await alan().get(`/api/projects/${site.id}/chat`)).status).toBe(403);
  }, 30_000);

  test('stops a reply and hides its history when access to another searched team is revoked', async () => {
    const payroll = await teamByName('Payroll België');
    const atlas = await teamByName('Klantteam Atlas');
    const oldHistory = (await ada().get<ProjectChatTurn[]>(`/api/projects/${payroll.id}/chat`)).body;
    const firstResponse = await fetch(`${stack.baseUrl}/api/projects/${payroll.id}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-user': 'demo_wanne' },
      body: JSON.stringify({ message: 'Compare the payroll rules with Atlas' }),
    });
    expect(firstResponse.status).toBe(200);
    await firstResponse.text();
    expect((await ada().get<ProjectChatTurn[]>(`/api/projects/${payroll.id}/chat`)).body).toHaveLength(oldHistory.length + 1);

    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    blockNext = { started: () => started(), wait: new Promise<void>((resolve) => { release = resolve; }) };
    const request = fetch(`${stack.baseUrl}/api/projects/${payroll.id}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-user': 'demo_wanne' },
      body: JSON.stringify({ message: 'Check my access while searching' }),
    });
    await startedPromise;
    try {
      await stack.handle.db.delete(projectMembers).where(and(eq(projectMembers.projectId, atlas.id), eq(projectMembers.userId, 'demo_wanne')));
      release();
      const response = await request;
      const events = parseEvents(await response.text());
      expect(events.some((event) => event.type === 'text')).toBe(false);
      expect(events.at(-1)).toMatchObject({ type: 'error', message: 'The conversation could not be saved. Check your project access and try again.' });
      expect((await ada().get<ProjectChatTurn[]>(`/api/projects/${payroll.id}/chat`)).body).toEqual([]);
    } finally {
      release();
      await stack.handle.db.insert(projectMembers).values({ projectId: atlas.id, userId: 'demo_wanne', role: 'editor' }).onConflictDoNothing();
    }
  }, 30_000);

  test('hides provider failure details from the client and reports unavailable status', async () => {
    const failure = await startTestStack({
      chatStatus: async () => ({ available: true, model: 'fake-chat-model' }),
      chatRunner: async () => { throw new Error('SECRET_API_TOKEN must not leak'); },
    });
    try {
      const failureAccess = await apiClient(failure.baseUrl, 'demo_wanne').get<Access>('/api/access');
      const failureSite = failureAccess.body.teams.find((team) => team.name === 'Payroll België');
      if (!failureSite) throw new Error('Seed team Payroll België is missing');
      const result = await fetch(`${failure.baseUrl}/api/projects/${failureSite.id}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dev-user': 'demo_wanne' },
        body: JSON.stringify({ message: 'Fail safely' }),
      });
      const text = await result.text();
      expect(text).not.toContain('SECRET_API_TOKEN');
      expect(text).toContain('could not finish this reply');
    } finally {
      await failure.stop();
    }

    const unavailable = await startTestStack({ chatStatus: async () => ({ available: false, message: 'Codex is unavailable' }) });
    try {
      const currentSite = await (async () => {
        const access = await apiClient(unavailable.baseUrl, 'demo_wanne').get<Access>('/api/access');
        const project = access.body.teams.find((item) => item.name === 'Payroll België');
        if (!project) throw new Error('Seed team Payroll België is missing');
        return project;
      })();
      expect(await apiClient(unavailable.baseUrl, 'demo_wanne').get('/api/chat/status')).toMatchObject({
        status: 200,
        body: { available: false, message: 'Codex is unavailable' },
      });
      const rejected = await apiClient(unavailable.baseUrl, 'demo_wanne').post(`/api/projects/${currentSite.id}/chat`, { message: 'Try unavailable chat' });
      expect(rejected.status).toBe(400);
    } finally {
      await unavailable.stop();
    }
  }, 60_000);
});
