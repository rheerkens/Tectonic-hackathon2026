import type { Database } from '@tectonic/db';
import {
  ClientMessageSchema,
  projectTopic,
  type PresenceUser,
  type RealtimeEvent,
  type ServerMessage,
} from '@tectonic/shared';
import type { Server, ServerWebSocket, WebSocketHandler } from 'bun';
import type { Authenticator, Principal } from './auth.ts';
import { ApiError } from './errors.ts';
import { getProjectRole } from './permissions.ts';
import type { Logger } from './log.ts';

export interface SocketData {
  id: string;
  principal: Principal | null;
  subscriptions: Set<string>;
  authTimer: ReturnType<typeof setTimeout> | null;
  /** Messages from one socket are handled strictly in order (subscribe awaits the database). */
  queue: Promise<void>;
  /** Messages received but not yet handled; bounded so a silent client cannot pile up work. */
  pending: number;
  badMessages: number;
  /** Bumped on every successful auth and on close; in-flight permission checks from an older generation are discarded. */
  gen: number;
  /** Outbound event chain so async permission checks still deliver events in seq order. */
  out: Promise<void>;
}

export interface Realtime {
  /** Must be called once with the Bun server so events can be published. */
  attach(server: Server<SocketData>): void;
  /** Broadcasts a persisted change to everyone subscribed to the project. */
  publish(projectId: string, event: RealtimeEvent, actorId: string | null, audienceProjectIds?: string[]): void;
  /** Re-validates every subscriber of a project after membership changes. */
  revalidateSubscribers(projectId: string): Promise<void>;
  /** Hono route handler that upgrades the request to a WebSocket. */
  upgrade(request: Request, server: Server<SocketData>): Response;
  websocket: WebSocketHandler<SocketData>;
  connectionCount(): number;
}

const AUTH_TIMEOUT_MS = 5_000;
const MAX_PENDING = 20;
const MAX_PENDING_UNAUTHENTICATED = 3;
const MAX_BAD_MESSAGES = 5;
const REVALIDATE_INTERVAL_MS = 30_000;

export function createRealtime(deps: { db: Database; authenticator: Authenticator; log: Logger }): Realtime {
  const { db, authenticator, log } = deps;
  let server: Server<SocketData> | null = null;
  let seq = 0;
  let nextConnectionId = 1;
  /** projectId -> connectionId -> socket */
  const rooms = new Map<string, Map<string, ServerWebSocket<SocketData>>>();
  const sockets = new Map<string, ServerWebSocket<SocketData>>();

  const send = (ws: ServerWebSocket<SocketData>, message: ServerMessage) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(message));
  };

  const broadcast = (projectId: string, message: ServerMessage) => {
    server?.publish(projectTopic(projectId), JSON.stringify(message));
  };

  const presenceFor = (projectId: string): PresenceUser[] => {
    const byUser = new Map<string, PresenceUser>();
    for (const socket of rooms.get(projectId)?.values() ?? []) {
      const p = socket.data.principal;
      if (!p) continue;
      const existing = byUser.get(p.userId);
      if (existing) existing.connections += 1;
      else byUser.set(p.userId, { userId: p.userId, name: p.name, color: p.color, connections: 1 });
    }
    return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
  };

  const lastPresence = new Map<string, string>();
  const broadcastPresence = (projectId: string) => {
    const users = presenceFor(projectId);
    const key = JSON.stringify(users);
    if (lastPresence.get(projectId) === key) return;
    if (users.length === 0) lastPresence.delete(projectId);
    else lastPresence.set(projectId, key);
    broadcast(projectId, { type: 'presence', projectId, users });
  };

  const leaveRoom = (ws: ServerWebSocket<SocketData>, projectId: string, notify: boolean) => {
    const room = rooms.get(projectId);
    room?.delete(ws.data.id);
    if (room && room.size === 0) rooms.delete(projectId);
    ws.data.subscriptions.delete(projectId);
    if (ws.readyState === 1) ws.unsubscribe(projectTopic(projectId));
    if (notify) send(ws, { type: 'unsubscribed', projectId });
    broadcastPresence(projectId);
  };

  /** Captures the socket's auth generation and room membership; returns whether a check result is still current. */
  const stillCurrent = (ws: ServerWebSocket<SocketData>, projectId: string) => {
    const gen = ws.data.gen;
    return () => ws.readyState === 1 && ws.data.gen === gen && rooms.get(projectId)?.get(ws.data.id) === ws;
  };

  const evict = (ws: ServerWebSocket<SocketData>, projectId: string) => {
    send(ws, { type: 'error', code: 'forbidden', message: 'Your access to this project was removed', projectId });
    leaveRoom(ws, projectId, true);
  };

  const subscribe = async (ws: ServerWebSocket<SocketData>, projectId: string) => {
    const principal = ws.data.principal;
    if (!principal) return send(ws, { type: 'error', code: 'unauthorized', message: 'Authenticate first', projectId });
    const role = await getProjectRole(db, projectId, principal.userId);
    if (!role) {
      return send(ws, { type: 'error', code: 'forbidden', message: 'You are not a member of this project', projectId });
    }
    if (ws.readyState !== 1) return;
    ws.subscribe(projectTopic(projectId));
    ws.data.subscriptions.add(projectId);
    let room = rooms.get(projectId);
    if (!room) rooms.set(projectId, (room = new Map()));
    room.set(ws.data.id, ws);
    send(ws, { type: 'subscribed', projectId });
    broadcastPresence(projectId);
  };

  const handleAuth = async (ws: ServerWebSocket<SocketData>, input: { token?: string; devUser?: string }) => {
    try {
      const principal = await authenticator.authenticate({
        authorization: input.token ? `Bearer ${input.token}` : null,
        devUser: input.devUser ?? null,
      });
      if (ws.readyState !== 1) return; // closed while authenticating: do not touch state
      if (ws.data.authTimer) clearTimeout(ws.data.authTimer);
      ws.data.authTimer = null;
      // Re-auth resets the socket: drop the previous principal's rooms/presence, subscribe again afresh.
      for (const projectId of [...ws.data.subscriptions]) leaveRoom(ws, projectId, true);
      ws.data.gen += 1;
      ws.data.principal = principal;
      send(ws, {
        type: 'hello',
        userId: principal.userId,
        name: principal.name,
        authSource: principal.source,
        serverTime: new Date().toISOString(),
      });
    } catch (error) {
      if (ws.readyState !== 1) return;
      const message = error instanceof ApiError ? error.message : 'Authentication failed';
      send(ws, { type: 'error', code: 'unauthorized', message });
      ws.close(4401, 'unauthorized');
    }
  };

  const websocket: WebSocketHandler<SocketData> = {
    open(ws) {
      sockets.set(ws.data.id, ws);
      ws.data.authTimer = setTimeout(() => {
        if (!ws.data.principal) {
          send(ws, { type: 'error', code: 'auth_timeout', message: 'No auth message received' });
          ws.close(4408, 'auth timeout');
        }
      }, AUTH_TIMEOUT_MS);
    },
    message(ws, raw) {
      const limit = ws.data.principal ? MAX_PENDING : MAX_PENDING_UNAUTHENTICATED;
      if (ws.data.pending >= limit) return ws.close(1008, 'too many pending messages');
      ws.data.pending += 1;
      ws.data.queue = ws.data.queue.then(() => (ws.readyState === 1 ? handleMessage(ws, raw) : undefined)).catch((error) => {
        log.warn('realtime message failed', { message: error instanceof Error ? error.message : String(error) });
      }).finally(() => {
        ws.data.pending -= 1;
      });
    },
    close(ws) {
      if (ws.data.authTimer) clearTimeout(ws.data.authTimer);
      sockets.delete(ws.data.id);
      ws.data.gen += 1;
      for (const projectId of [...ws.data.subscriptions]) leaveRoom(ws, projectId, false);
    },
  };

  async function handleMessage(ws: ServerWebSocket<SocketData>, raw: string | Buffer) {
    let parsed;
    try {
      parsed = ClientMessageSchema.safeParse(JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)));
    } catch {
      parsed = { success: false as const, error: null };
    }
    if (!parsed.success) {
      if (++ws.data.badMessages >= MAX_BAD_MESSAGES) return ws.close(1008, 'too many invalid messages');
      return send(ws, { type: 'error', code: 'bad_message', message: 'Malformed message' });
    }
    const message = parsed.data;
    if (message.type === 'auth') return handleAuth(ws, message);
    if (!ws.data.principal) {
      send(ws, { type: 'error', code: 'unauthorized', message: 'Send an auth message first' });
      return ws.close(4401, 'unauthorized');
    }
    switch (message.type) {
      case 'subscribe':
        return subscribe(ws, message.projectId);
      case 'unsubscribe':
        return leaveRoom(ws, message.projectId, true);
      case 'ping':
        return send(ws, { type: 'pong' });
    }
  }

  // No API route changes membership yet, so sweep periodically as a backstop to the per-publish check.
  setInterval(() => {
    for (const projectId of [...rooms.keys()]) void api.revalidateSubscribers(projectId).catch(() => {});
  }, REVALIDATE_INTERVAL_MS).unref();

  const api: Realtime = {
    attach(s) {
      server = s;
    },
    publish(projectId, event, actorId, audienceProjectIds = []) {
      seq += 1;
      const message: ServerMessage = { type: 'event', projectId, seq, actorId, event };
      // Every recipient is re-checked against the database: a revoked member never receives the event
      // (and is evicted), and a restricted source only reaches members of every audience team.
      for (const ws of [...(rooms.get(projectId)?.values() ?? [])]) {
        const userId = ws.data.principal?.userId;
        if (!userId) continue;
        const current = stillCurrent(ws, projectId);
        const check = Promise.all([projectId, ...audienceProjectIds].map((id) => getProjectRole(db, id, userId)));
        check.catch(() => {});
        ws.data.out = ws.data.out.then(() => check).then(([own, ...rest]) => {
          if (!current()) return;
          if (!own) return evict(ws, projectId);
          if (rest.every((r) => r !== null)) send(ws, message);
        }).catch(() => {});
      }
      log.debug('realtime.publish', { projectId, kind: event.kind, seq });
    },
    async revalidateSubscribers(projectId) {
      const room = rooms.get(projectId);
      if (!room) return;
      for (const ws of [...room.values()]) {
        const principal = ws.data.principal;
        const current = stillCurrent(ws, projectId);
        const role = principal ? await getProjectRole(db, projectId, principal.userId) : null;
        if (!role && current()) evict(ws, projectId);
      }
    },
    upgrade(request, s) {
      if (!server) server = s;
      const data: SocketData = { id: String(nextConnectionId++), principal: null, subscriptions: new Set(), authTimer: null, queue: Promise.resolve(), pending: 0, badMessages: 0, gen: 0, out: Promise.resolve() };
      const ok = s.upgrade(request, { data });
      // Bun ignores the response once the upgrade succeeded; a 426 is returned otherwise.
      return ok ? new Response(null) : new Response('Expected a WebSocket upgrade', { status: 426 });
    },
    websocket,
    connectionCount: () => sockets.size,
  };
  return api;
}
