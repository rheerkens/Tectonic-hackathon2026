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
}

export interface Realtime {
  /** Must be called once with the Bun server so events can be published. */
  attach(server: Server<SocketData>): void;
  /** Broadcasts a persisted change to everyone subscribed to the project. */
  publish(projectId: string, event: RealtimeEvent, actorId: string | null): void;
  /** Re-validates every subscriber of a project after membership changes. */
  revalidateSubscribers(projectId: string): Promise<void>;
  /** Hono route handler that upgrades the request to a WebSocket. */
  upgrade(request: Request, server: Server<SocketData>): Response;
  websocket: WebSocketHandler<SocketData>;
  connectionCount(): number;
}

const AUTH_TIMEOUT_MS = 5_000;

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
      if (ws.data.authTimer) clearTimeout(ws.data.authTimer);
      ws.data.authTimer = null;
      ws.data.principal = principal;
      send(ws, {
        type: 'hello',
        userId: principal.userId,
        name: principal.name,
        authSource: principal.source,
        serverTime: new Date().toISOString(),
      });
    } catch (error) {
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
      ws.data.queue = ws.data.queue.then(() => handleMessage(ws, raw)).catch((error) => {
        log.warn('realtime message failed', { message: error instanceof Error ? error.message : String(error) });
      });
    },
    close(ws) {
      if (ws.data.authTimer) clearTimeout(ws.data.authTimer);
      sockets.delete(ws.data.id);
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

  return {
    attach(s) {
      server = s;
    },
    publish(projectId, event, actorId) {
      seq += 1;
      broadcast(projectId, { type: 'event', projectId, seq, actorId, event });
      log.debug('realtime.publish', { projectId, kind: event.kind, seq });
    },
    async revalidateSubscribers(projectId) {
      const room = rooms.get(projectId);
      if (!room) return;
      for (const ws of [...room.values()]) {
        const principal = ws.data.principal;
        const role = principal ? await getProjectRole(db, projectId, principal.userId) : null;
        if (!role) {
          send(ws, { type: 'error', code: 'forbidden', message: 'Your access to this project was removed', projectId });
          leaveRoom(ws, projectId, true);
        }
      }
    },
    upgrade(request, s) {
      if (!server) server = s;
      const data: SocketData = { id: String(nextConnectionId++), principal: null, subscriptions: new Set(), authTimer: null, queue: Promise.resolve() };
      const ok = s.upgrade(request, { data });
      // Bun ignores the response once the upgrade succeeded; a 426 is returned otherwise.
      return ok ? new Response(null) : new Response('Expected a WebSocket upgrade', { status: 426 });
    },
    websocket,
    connectionCount: () => sockets.size,
  };
}
