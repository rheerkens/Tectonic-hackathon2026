import { WS_PATH } from '@tectonic/shared';

/** Accept only https, or http for loopback hosts: bearer tokens must never travel in cleartext to a remote host. */
function safeApiOrigin(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '');
  if (!value) return '';
  try {
    const { protocol, hostname, origin } = new URL(value);
    const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');
    if (protocol === 'https:' || (protocol === 'http:' && local)) return origin;
  } catch {
    // fall through to the error below
  }
  console.error(`Ignoring VITE_API_ORIGIN "${value}": only https origins (or http for localhost) are allowed. Using same-origin.`);
  return '';
}

/** Absolute API origin for native shells / split deployments. Empty means same-origin. */
export const API_ORIGIN = safeApiOrigin((import.meta.env.VITE_API_ORIGIN as string | undefined) ?? '');

export const CLERK_PUBLISHABLE_KEY = ((import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ?? '').trim();

/** The frontend follows the key: with a Clerk publishable key it uses Clerk, otherwise the local bypass. */
export const AUTH_MODE: 'clerk' | 'dev-bypass' = CLERK_PUBLISHABLE_KEY ? 'clerk' : 'dev-bypass';

export function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`;
}

export function wsUrl(): string {
  if (API_ORIGIN) return `${API_ORIGIN.replace(/^http/, 'ws')}${WS_PATH}`;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}${WS_PATH}`;
}
