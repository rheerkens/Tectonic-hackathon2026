import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ProjectDetail, ProjectSummary, ServerMessage, Task } from '@tectonic/shared';
import { WsClient, apiClient, startTestStack, type TestStack } from './harness.ts';

let stack: TestStack;
let site: ProjectSummary;
let ops: ProjectSummary;

const isEvent = (kind: string, projectId?: string) => (m: ServerMessage) =>
  m.type === 'event' && m.event.kind === kind && (!projectId || m.projectId === projectId);

beforeAll(async () => {
  stack = await startTestStack();
  const projects = (await apiClient(stack.baseUrl, 'demo_ada').get<ProjectSummary[]>('/api/projects')).body;
  site = projects.find((p) => p.name === 'Launch Website')!;
  ops = projects.find((p) => p.name === 'Hackathon Ops')!;
}, 60_000);

afterAll(async () => {
  await stack.stop();
});

describe('websocket authentication and scoping', () => {
  test('requires an auth message before anything else', async () => {
    const ws = await WsClient.connect(stack.wsUrl);
    ws.send({ type: 'subscribe', projectId: site.id });
    const error = await ws.waitFor<Extract<ServerMessage, { type: 'error' }>>((m) => m.type === 'error');
    expect(error.code).toBe('unauthorized');
    const closed = await ws.closed;
    expect(closed.code).toBe(4401);
  });

  test('rejects unknown demo identities', async () => {
    const ws = await WsClient.connect(stack.wsUrl);
    const reply = await ws.auth('demo_nobody');
    expect(reply.type).toBe('error');
    expect((await ws.closed).code).toBe(4401);
  });

  test('non-members cannot subscribe and receive nothing', async () => {
    const alan = await WsClient.connect(stack.wsUrl);
    expect((await alan.auth('demo_alan')).type).toBe('hello');
    const reply = await alan.subscribe(ops.id);
    expect(reply).toMatchObject({ type: 'error', code: 'forbidden' });

    await apiClient(stack.baseUrl, 'demo_ada').post(`/api/projects/${ops.id}/tasks`, { title: 'Ops only' });
    expect(await alan.expectNone(isEvent('task.created'))).toBe(true);
    alan.close();
  });
});

describe('cross-session updates', () => {
  test('a change made by one session is persisted before another session hears about it', async () => {
    const ada = await WsClient.connect(stack.wsUrl);
    const grace = await WsClient.connect(stack.wsUrl);
    expect((await ada.auth('demo_ada')).type).toBe('hello');
    expect((await grace.auth('demo_grace')).type).toBe('hello');
    expect((await ada.subscribe(site.id)).type).toBe('subscribed');
    expect((await grace.subscribe(site.id)).type).toBe('subscribed');

    // Presence shows both users once both have subscribed.
    const presence = await grace.waitFor<Extract<ServerMessage, { type: 'presence' }>>(
      (m) => m.type === 'presence' && m.projectId === site.id && m.users.length === 2,
    );
    expect(presence.users.map((u) => u.userId).sort()).toEqual(['demo_ada', 'demo_grace']);

    const created = await apiClient(stack.baseUrl, 'demo_ada').post<Task>(`/api/projects/${site.id}/tasks`, { title: 'Realtime task' });
    expect(created.status).toBe(201);

    const event = await grace.waitFor<Extract<ServerMessage, { type: 'event' }>>(isEvent('task.created', site.id));
    expect(event.actorId).toBe('demo_ada');
    expect(event.event.kind === 'task.created' && event.event.task.id).toBe(created.body.id);
    // The originating session receives it as well.
    await ada.waitFor(isEvent('task.created', site.id));

    // Persist-before-broadcast: the task is readable the moment the event arrives.
    const detail = (await apiClient(stack.baseUrl, 'demo_grace').get<ProjectDetail>(`/api/projects/${site.id}`)).body;
    expect(detail.tasks.some((t) => t.id === created.body.id)).toBe(true);

    // Updates and deletes flow too.
    await apiClient(stack.baseUrl, 'demo_grace').patch(`/api/projects/${site.id}/tasks/${created.body.id}`, { status: 'in_progress' });
    const updated = await ada.waitFor<Extract<ServerMessage, { type: 'event' }>>(isEvent('task.updated', site.id));
    expect(updated.event.kind === 'task.updated' && updated.event.task.status).toBe('in_progress');

    await apiClient(stack.baseUrl, 'demo_ada').delete(`/api/projects/${site.id}/tasks/${created.body.id}`);
    await grace.waitFor(isEvent('task.deleted', site.id));

    ada.close();
    grace.close();
  });

  test('events are scoped to the subscribed project', async () => {
    const grace = await WsClient.connect(stack.wsUrl);
    await grace.auth('demo_grace');
    await grace.subscribe(site.id);
    await apiClient(stack.baseUrl, 'demo_ada').post(`/api/projects/${ops.id}/tasks`, { title: 'Other project' });
    expect(await grace.expectNone(isEvent('task.created'))).toBe(true);
    grace.close();
  });
});

describe('reconnect', () => {
  test('a session that reconnects refetches and sees changes made while it was offline', async () => {
    const api = apiClient(stack.baseUrl, 'demo_ada');
    const grace = await WsClient.connect(stack.wsUrl);
    await grace.auth('demo_grace');
    await grace.subscribe(site.id);

    const task = (await api.post<Task>(`/api/projects/${site.id}/tasks`, { title: 'Offline edit target' })).body;
    await grace.waitFor(isEvent('task.created', site.id));

    // Grace drops off the network.
    grace.close();
    await grace.closed;

    // Meanwhile Ada keeps working.
    await api.patch(`/api/projects/${site.id}/tasks/${task.id}`, { title: 'Edited while Grace was offline', status: 'review' });

    // Grace reconnects: re-auth, re-subscribe, and refetch current state.
    const reconnected = await WsClient.connect(stack.wsUrl);
    await reconnected.auth('demo_grace');
    expect((await reconnected.subscribe(site.id)).type).toBe('subscribed');
    const detail = (await apiClient(stack.baseUrl, 'demo_grace').get<ProjectDetail>(`/api/projects/${site.id}`)).body;
    expect(detail.tasks.find((t) => t.id === task.id)).toMatchObject({ title: 'Edited while Grace was offline', status: 'review' });

    // And live events resume on the new connection.
    await api.patch(`/api/projects/${site.id}/tasks/${task.id}`, { status: 'done' });
    await reconnected.waitFor(isEvent('task.updated', site.id));
    reconnected.close();
  });
});

describe('membership changes', () => {
  test('removing a member kicks their live subscription', async () => {
    const api = apiClient(stack.baseUrl, 'demo_ada');
    await api.post(`/api/projects/${site.id}/members`, { userId: 'demo_alan', role: 'editor' });
    const alan = await WsClient.connect(stack.wsUrl);
    await alan.auth('demo_alan');
    expect((await alan.subscribe(site.id)).type).toBe('subscribed');

    await api.delete(`/api/projects/${site.id}/members/demo_alan`);
    const kicked = await alan.waitFor<Extract<ServerMessage, { type: 'error' }>>((m) => m.type === 'error' && m.code === 'forbidden');
    expect(kicked.projectId).toBe(site.id);
    await alan.waitFor((m) => m.type === 'unsubscribed' && m.projectId === site.id);

    await api.post(`/api/projects/${site.id}/tasks`, { title: 'After removal' });
    expect(await alan.expectNone(isEvent('task.created'))).toBe(true);
    alan.close();
  });
});
