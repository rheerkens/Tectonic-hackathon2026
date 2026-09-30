import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Health, ProjectDetail, ProjectSummary, Task } from '@tectonic/shared';
import { apiClient, startTestStack, type TestStack } from './harness.ts';

let stack: TestStack;
const ada = () => apiClient(stack.baseUrl, 'demo_ada');
const grace = () => apiClient(stack.baseUrl, 'demo_grace');
const margaret = () => apiClient(stack.baseUrl, 'demo_margaret');
const alan = () => apiClient(stack.baseUrl, 'demo_alan');
const anonymous = () => apiClient(stack.baseUrl, null);

async function projectByName(name: string): Promise<ProjectSummary> {
  const { body } = await ada().get<ProjectSummary[]>('/api/projects');
  const project = body.find((p) => p.name === name);
  if (!project) throw new Error(`seed project ${name} missing`);
  return project;
}

beforeAll(async () => {
  stack = await startTestStack();
}, 60_000);

afterAll(async () => {
  await stack.stop();
});

describe('health', () => {
  test('reports ok with database and auth mode', async () => {
    const { status, body } = await anonymous().get<Health>('/api/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('ok');
    expect(body.authMode).toBe('dev-bypass');
  });
});

describe('authentication (dev bypass)', () => {
  test('rejects requests without a demo identity', async () => {
    const { status, body } = await anonymous().get<{ error: { code: string } }>('/api/projects');
    expect(status).toBe(401);
    expect(body.error.code).toBe('unauthorized');
  });

  test('rejects unknown demo identities', async () => {
    const { status } = await apiClient(stack.baseUrl, 'demo_nobody').get('/api/projects');
    expect(status).toBe(401);
  });

  test('resolves the demo identity', async () => {
    const { status, body } = await grace().get<{ id: string; name: string; authSource: string }>('/api/me');
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: 'demo_grace', name: 'Grace Hopper', authSource: 'dev-bypass' });
  });
});

describe('permissions', () => {
  test('each user only lists projects they belong to', async () => {
    const adaProjects = (await ada().get<ProjectSummary[]>('/api/projects')).body;
    const alanProjects = (await alan().get<ProjectSummary[]>('/api/projects')).body;
    expect(adaProjects.map((p) => p.name).sort()).toEqual(['Hackathon Ops', 'Launch Website', 'Mobile App', 'Vandeputte Logistics']);
    expect(alanProjects.map((p) => p.name)).toEqual(['Vandeputte Logistics', 'Mobile App']);
    expect(adaProjects.find((p) => p.name === 'Launch Website')?.role).toBe('owner');
    expect(adaProjects.find((p) => p.name === 'Mobile App')?.role).toBe('editor');
  });

  test('non-members get 403, unknown projects 404', async () => {
    const ops = await projectByName('Hackathon Ops');
    expect((await alan().get(`/api/projects/${ops.id}`)).status).toBe(403);
    expect((await alan().post(`/api/projects/${ops.id}/tasks`, { title: 'sneaky' })).status).toBe(403);
    expect((await ada().get('/api/projects/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  test('viewers can read but not write', async () => {
    const site = await projectByName('Launch Website');
    expect((await margaret().get(`/api/projects/${site.id}`)).status).toBe(200);
    const write = await margaret().post<{ error: { message: string } }>(`/api/projects/${site.id}/tasks`, { title: 'nope' });
    expect(write.status).toBe(403);
    expect(write.body.error.message).toMatch(/viewer/);
  });

  test('only owners manage members', async () => {
    const site = await projectByName('Launch Website');
    expect((await grace().post(`/api/projects/${site.id}/members`, { userId: 'demo_alan', role: 'editor' })).status).toBe(403);
    const added = await ada().post<{ userId: string; role: string }>(`/api/projects/${site.id}/members`, { userId: 'demo_alan', role: 'editor' });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ userId: 'demo_alan', role: 'editor' });
    expect((await alan().get(`/api/projects/${site.id}`)).status).toBe(200);
    expect((await ada().delete(`/api/projects/${site.id}/members/demo_alan`)).status).toBe(200);
    expect((await alan().get(`/api/projects/${site.id}`)).status).toBe(403);
    // The last owner cannot be removed.
    expect((await ada().delete(`/api/projects/${site.id}/members/demo_ada`)).status).toBe(409);
  });
});

describe('validation', () => {
  test('rejects invalid bodies with details', async () => {
    const site = await projectByName('Launch Website');
    const { status, body } = await ada().post<{ error: { code: string; message: string } }>(`/api/projects/${site.id}/tasks`, {
      title: '',
      status: 'nonsense',
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.message).toMatch(/title/);
  });
});

describe('persistence', () => {
  test('created tasks survive an API restart and a database restart', async () => {
    const site = await projectByName('Launch Website');
    const created = await ada().post<Task>(`/api/projects/${site.id}/tasks`, {
      title: 'Persisted task',
      description: 'Should still be here later',
      priority: 'high',
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('backlog');

    const moved = await ada().patch<Task>(`/api/projects/${site.id}/tasks/${created.body.id}`, { status: 'review' });
    expect(moved.status).toBe(200);
    expect(moved.body.version).toBe(2);

    await stack.restartServer();
    let detail = (await ada().get<ProjectDetail>(`/api/projects/${site.id}`)).body;
    expect(detail.tasks.find((t) => t.id === created.body.id)).toMatchObject({ title: 'Persisted task', status: 'review' });

    await stack.restartDatabase();
    detail = (await ada().get<ProjectDetail>(`/api/projects/${site.id}`)).body;
    expect(detail.tasks.find((t) => t.id === created.body.id)).toMatchObject({ title: 'Persisted task', status: 'review', version: 2 });
  }, 30_000);

  test('projects are created with the creator as owner', async () => {
    const created = await alan().post<ProjectSummary>('/api/projects', { name: 'Alan Project', description: 'x' });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe('owner');
    const detail = (await alan().get<ProjectDetail>(`/api/projects/${created.body.id}`)).body;
    expect(detail.members).toHaveLength(1);
    expect((await ada().get(`/api/projects/${created.body.id}`)).status).toBe(403);
    expect((await alan().delete(`/api/projects/${created.body.id}`)).status).toBe(200);
    expect((await alan().get(`/api/projects/${created.body.id}`)).status).toBe(404);
  });

  test('moving a task to another column appends it at the end of that column', async () => {
    const site = await projectByName('Launch Website');
    const detail = (await ada().get<ProjectDetail>(`/api/projects/${site.id}`)).body;
    const backlog = detail.tasks.filter((t) => t.status === 'backlog');
    const done = detail.tasks.filter((t) => t.status === 'done');
    const maxDone = Math.max(...done.map((t) => t.position));
    const moved = await ada().patch<Task>(`/api/projects/${site.id}/tasks/${backlog[0]!.id}`, { status: 'done' });
    expect(moved.body.position).toBeGreaterThan(maxDone);
    const deleted = await ada().delete(`/api/projects/${site.id}/tasks/${moved.body.id}`);
    expect(deleted.status).toBe(200);
    expect((await ada().delete(`/api/projects/${site.id}/tasks/${moved.body.id}`)).status).toBe(404);
  });
});
