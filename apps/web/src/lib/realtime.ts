import { ServerMessageSchema, type ClientMessage, type PresenceUser, type RealtimeEvent, type ServerMessage } from '@tectonic/shared';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface RealtimeEnvelope {
  projectId: string;
  seq: number;
  actorId: string | null;
  event: RealtimeEvent;
}

export interface RealtimeAuth {
  token?: string;
  devUser?: string;
}

export interface RealtimeClientOptions {
  url: string | (() => string);
  getAuth: () => Promise<RealtimeAuth>;
  /** Injectable for tests. */
  WebSocketImpl?: typeof WebSocket;
  baseDelayMs?: number;
  maxDelayMs?: number;
  pingIntervalMs?: number;
  /** Close the socket when a ping gets no reply within this window (detects silent drops). */
  pongTimeoutMs?: number;
  /** Injectable for tests; defaults to `window` when available. */
  eventTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
}

type Listener<T> = (value: T) => void;

/**
 * Small WebSocket client with the behaviour the app needs:
 *  - authenticates with the first message, then (re)subscribes to projects,
 *  - reconnects with capped exponential backoff after an unexpected close,
 *  - tells the app when a connection was *re*-established so it can refetch
 *    everything it missed while offline (no offline queue, online sync only).
 */
export class RealtimeClient {
  private socket: WebSocket | null = null;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly subscriptions = new Map<string, number>();
  private attempt = 0;
  private hadSession = false;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly eventTarget: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
  private readonly onBrowserOffline = () => this.dropConnection('browser offline');
  private readonly onBrowserOnline = () => this.retryNow();
  private _status: ConnectionStatus = 'offline';

  private readonly statusListeners = new Set<Listener<ConnectionStatus>>();
  private readonly eventListeners = new Set<Listener<RealtimeEnvelope>>();
  private readonly presenceListeners = new Set<Listener<{ projectId: string; users: PresenceUser[] }>>();
  private readonly reconnectListeners = new Set<Listener<void>>();
  private readonly errorListeners = new Set<Listener<Extract<ServerMessage, { type: 'error' }>>>();

  constructor(private readonly options: RealtimeClientOptions) {
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
    this.eventTarget = options.eventTarget === undefined ? (typeof window !== 'undefined' ? window : null) : options.eventTarget;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  connect(): void {
    this.closedByUser = false;
    this.listenToBrowser(true);
    if (this.socket && (this.socket.readyState === 0 || this.socket.readyState === 1)) return;
    this.setStatus(this.hadSession ? 'reconnecting' : 'connecting');
    const url = typeof this.options.url === 'function' ? this.options.url() : this.options.url;
    let socket: WebSocket;
    try {
      socket = new this.WebSocketImpl(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = async () => {
      let auth: RealtimeAuth;
      try {
        auth = await this.options.getAuth();
      } catch {
        socket.close(4000, 'auth unavailable');
        return;
      }
      this.send({ type: 'auth', ...auth });
    };
    socket.onmessage = (event) => {
      this.clearPongTimer();
      this.handleMessage(String(event.data));
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopPing();
      if (this.closedByUser) return this.setStatus('offline');
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      // onclose follows; nothing to do here.
    };
  }

  close(): void {
    this.closedByUser = true;
    this.listenToBrowser(false);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopPing();
    this.socket?.close(1000, 'client closed');
    this.socket = null;
    this.setStatus('offline');
  }

  /** Forces a reconnect cycle, e.g. when the browser reports it went offline or a heartbeat timed out. */
  dropConnection(reason: string): void {
    if (this.closedByUser) return;
    const socket = this.socket;
    this.socket = null;
    this.stopPing();
    if (socket) {
      socket.onclose = null;
      try {
        socket.close(4001, reason);
      } catch {
        /* already closed */
      }
    }
    this.scheduleReconnect();
  }

  /** Skips the backoff delay, e.g. when the browser reports it is back online. */
  retryNow(): void {
    if (this.closedByUser) return;
    if (this.socket && (this.socket.readyState === 0 || this.socket.readyState === 1)) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.attempt = 0;
    this.connect();
  }

  private listenToBrowser(on: boolean) {
    if (!this.eventTarget) return;
    const method = on ? 'addEventListener' : 'removeEventListener';
    this.eventTarget[method]('offline', this.onBrowserOffline);
    this.eventTarget[method]('online', this.onBrowserOnline);
  }

  /** Subscribe to a project; returns an unsubscribe function (reference counted). */
  subscribe(projectId: string): () => void {
    const count = this.subscriptions.get(projectId) ?? 0;
    this.subscriptions.set(projectId, count + 1);
    if (count === 0 && this._status === 'online') this.send({ type: 'subscribe', projectId });
    return () => {
      const current = this.subscriptions.get(projectId) ?? 0;
      if (current <= 1) {
        this.subscriptions.delete(projectId);
        if (this._status === 'online') this.send({ type: 'unsubscribe', projectId });
      } else {
        this.subscriptions.set(projectId, current - 1);
      }
    };
  }

  onStatus(listener: Listener<ConnectionStatus>): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }
  onEvent(listener: Listener<RealtimeEnvelope>): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
  onPresence(listener: Listener<{ projectId: string; users: PresenceUser[] }>): () => void {
    this.presenceListeners.add(listener);
    return () => this.presenceListeners.delete(listener);
  }
  /** Fires after a connection is re-established following a drop. Refetch state here. */
  onReconnect(listener: Listener<void>): () => void {
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }
  onError(listener: Listener<Extract<ServerMessage, { type: 'error' }>>): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private send(message: ClientMessage) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message));
  }

  private handleMessage(raw: string) {
    let parsed: ReturnType<typeof ServerMessageSchema.safeParse>;
    try {
      parsed = ServerMessageSchema.safeParse(JSON.parse(raw));
    } catch {
      return;
    }
    if (!parsed.success) return;
    const message = parsed.data;
    switch (message.type) {
      case 'hello': {
        const isReconnect = this.hadSession;
        this.hadSession = true;
        this.attempt = 0;
        this.setStatus('online');
        for (const projectId of this.subscriptions.keys()) this.send({ type: 'subscribe', projectId });
        this.startPing();
        if (isReconnect) for (const listener of this.reconnectListeners) listener();
        return;
      }
      case 'event':
        for (const listener of this.eventListeners) listener({ projectId: message.projectId, seq: message.seq, actorId: message.actorId, event: message.event });
        return;
      case 'presence':
        for (const listener of this.presenceListeners) listener({ projectId: message.projectId, users: message.users });
        return;
      case 'error':
        for (const listener of this.errorListeners) listener(message);
        return;
      default:
        return;
    }
  }

  private scheduleReconnect() {
    if (this.closedByUser) return;
    this.setStatus(this.hadSession ? 'reconnecting' : 'connecting');
    const base = this.options.baseDelayMs ?? 500;
    const max = this.options.maxDelayMs ?? 10_000;
    const delay = Math.min(max, base * 2 ** Math.min(this.attempt, 6)) * (0.75 + Math.random() * 0.5);
    this.attempt += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startPing() {
    this.stopPing();
    const interval = this.options.pingIntervalMs ?? 25_000;
    const pongTimeout = this.options.pongTimeoutMs ?? 10_000;
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
      if (!this.pongTimer) this.pongTimer = setTimeout(() => this.dropConnection('heartbeat timeout'), pongTimeout);
    }, interval);
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.clearPongTimer();
  }

  private clearPongTimer() {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  private setStatus(status: ConnectionStatus) {
    if (this._status === status) return;
    this._status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
