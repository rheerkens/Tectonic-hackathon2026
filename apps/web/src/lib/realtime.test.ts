import { describe, expect, test } from 'bun:test';
import { RealtimeClient } from './realtime.ts';

/** Scripted stand-in for the browser WebSocket: the test drives open/close/messages. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  // test helpers
  serverOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
  serverSend(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  serverDrop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const PROJECT = '11111111-1111-4111-8111-111111111111';

class FakeEventTarget {
  listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, listener: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }
  fire(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

function makeClient(overrides: { pingIntervalMs?: number; pongTimeoutMs?: number } = {}) {
  FakeSocket.instances = [];
  const statuses: string[] = [];
  let reconnects = 0;
  const browser = new FakeEventTarget();
  const client = new RealtimeClient({
    url: 'ws://test/ws',
    getAuth: async () => ({ devUser: 'demo_ada' }),
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    baseDelayMs: 1,
    maxDelayMs: 2,
    pingIntervalMs: overrides.pingIntervalMs ?? 60_000,
    pongTimeoutMs: overrides.pongTimeoutMs ?? 60_000,
    eventTarget: browser as unknown as Window,
  });
  client.onStatus((s) => statuses.push(s));
  client.onReconnect(() => reconnects++);
  return { client, statuses, reconnects: () => reconnects, browser };
}

const hello = { type: 'hello', userId: 'demo_ada', name: 'Ada', authSource: 'dev-bypass', serverTime: '' };

describe('RealtimeClient', () => {
  test('authenticates first, then subscribes, and reports online', async () => {
    const { client, statuses } = makeClient();
    client.subscribe(PROJECT);
    client.connect();
    const socket = FakeSocket.instances[0]!;
    socket.serverOpen();
    await tick();
    expect(socket.sent[0]).toEqual({ type: 'auth', devUser: 'demo_ada' });
    socket.serverSend({ type: 'hello', userId: 'demo_ada', name: 'Ada', authSource: 'dev-bypass', serverTime: new Date().toISOString() });
    expect(socket.sent[1]).toEqual({ type: 'subscribe', projectId: PROJECT });
    expect(client.status).toBe('online');
    expect(statuses).toEqual(['connecting', 'online']);
  });

  test('reconnects after a drop, resubscribes and fires onReconnect so the app can refetch', async () => {
    const { client, statuses, reconnects } = makeClient();
    client.subscribe(PROJECT);
    client.connect();
    const first = FakeSocket.instances[0]!;
    first.serverOpen();
    await tick();
    first.serverSend({ type: 'hello', userId: 'demo_ada', name: 'Ada', authSource: 'dev-bypass', serverTime: '' });
    expect(reconnects()).toBe(0);

    first.serverDrop();
    expect(client.status).toBe('reconnecting');
    await new Promise((r) => setTimeout(r, 20));
    expect(FakeSocket.instances.length).toBe(2);
    const second = FakeSocket.instances[1]!;
    second.serverOpen();
    await tick();
    expect(second.sent[0]).toMatchObject({ type: 'auth' });
    second.serverSend({ type: 'hello', userId: 'demo_ada', name: 'Ada', authSource: 'dev-bypass', serverTime: '' });
    expect(second.sent[1]).toEqual({ type: 'subscribe', projectId: PROJECT });
    expect(reconnects()).toBe(1);
    expect(statuses).toEqual(['connecting', 'online', 'reconnecting', 'online']);
  });

  test('keeps retrying with backoff while the server is unreachable', async () => {
    const { client } = makeClient();
    client.connect();
    for (let i = 0; i < 3; i++) {
      FakeSocket.instances[i]!.serverDrop();
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(FakeSocket.instances.length).toBeGreaterThanOrEqual(4);
    client.close();
    const count = FakeSocket.instances.length;
    await new Promise((r) => setTimeout(r, 15));
    expect(FakeSocket.instances.length).toBe(count); // no reconnects after an intentional close
    expect(client.status).toBe('offline');
  });

  test('dispatches events, presence and errors to listeners', async () => {
    const { client } = makeClient();
    const events: unknown[] = [];
    const presence: unknown[] = [];
    const errors: unknown[] = [];
    client.onEvent((e) => events.push(e));
    client.onPresence((p) => presence.push(p));
    client.onError((e) => errors.push(e));
    client.connect();
    const socket = FakeSocket.instances[0]!;
    socket.serverOpen();
    await tick();
    socket.serverSend({ type: 'event', projectId: PROJECT, seq: 1, actorId: 'demo_grace', event: { kind: 'task.deleted', taskId: PROJECT } });
    socket.serverSend({ type: 'presence', projectId: PROJECT, users: [{ userId: 'demo_grace', name: 'Grace', color: '#000', connections: 1 }] });
    socket.serverSend({ type: 'error', code: 'forbidden', message: 'nope', projectId: PROJECT });
    socket.serverSend('garbage');
    expect(events).toHaveLength(1);
    expect(presence).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  test('treats a browser offline event as a dropped connection and reconnects immediately when back online', async () => {
    const { client, statuses, browser, reconnects } = makeClient();
    client.connect();
    const first = FakeSocket.instances[0]!;
    first.serverOpen();
    await tick();
    first.serverSend(hello);
    expect(client.status).toBe('online');

    browser.fire('offline');
    expect(client.status).toBe('reconnecting');
    expect(first.readyState).toBe(3);

    browser.fire('online');
    const second = FakeSocket.instances[1]!;
    expect(second).toBeDefined();
    second.serverOpen();
    await tick();
    second.serverSend(hello);
    expect(reconnects()).toBe(1);
    expect(statuses.at(-1)).toBe('online');
  });

  test('drops a silent connection when a ping gets no pong', async () => {
    const { client } = makeClient({ pingIntervalMs: 5, pongTimeoutMs: 10 });
    client.connect();
    const first = FakeSocket.instances[0]!;
    first.serverOpen();
    await tick();
    first.serverSend(hello);
    await new Promise((r) => setTimeout(r, 40));
    expect(first.sent.some((m) => (m as { type: string }).type === 'ping')).toBe(true);
    expect(client.status).toBe('reconnecting');
    expect(FakeSocket.instances.length).toBeGreaterThan(1);
    client.close();
  });

  test('a pong (or any message) keeps the connection alive', async () => {
    const { client } = makeClient({ pingIntervalMs: 5, pongTimeoutMs: 15 });
    client.connect();
    const first = FakeSocket.instances[0]!;
    first.serverOpen();
    await tick();
    first.serverSend(hello);
    const keepAlive = setInterval(() => first.serverSend({ type: 'pong' }), 4);
    await new Promise((r) => setTimeout(r, 60));
    clearInterval(keepAlive);
    expect(client.status).toBe('online');
    expect(FakeSocket.instances.length).toBe(1);
    client.close();
  });

  test('reference-counts subscriptions', async () => {
    const { client } = makeClient();
    client.connect();
    const socket = FakeSocket.instances[0]!;
    socket.serverOpen();
    await tick();
    socket.serverSend({ type: 'hello', userId: 'demo_ada', name: 'Ada', authSource: 'dev-bypass', serverTime: '' });
    const a = client.subscribe(PROJECT);
    const b = client.subscribe(PROJECT);
    expect(socket.sent.filter((m) => (m as { type: string }).type === 'subscribe')).toHaveLength(1);
    a();
    expect(socket.sent.filter((m) => (m as { type: string }).type === 'unsubscribe')).toHaveLength(0);
    b();
    expect(socket.sent.filter((m) => (m as { type: string }).type === 'unsubscribe')).toHaveLength(1);
  });
});
