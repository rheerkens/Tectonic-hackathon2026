import type { AuthSource } from '@tectonic/shared';

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  color: string;
}

export interface AuthSession {
  mode: AuthSource;
  user: SessionUser;
  /** Headers to attach to every API request. */
  getAuthHeaders(): Promise<Record<string, string>>;
  /** Credentials for the WebSocket `auth` message. */
  getWsAuth(): Promise<{ token?: string; devUser?: string }>;
  signOut(): void;
  /** Only in dev-bypass mode: swap to another demo identity. */
  switchUser?: (userId: string) => void;
}
