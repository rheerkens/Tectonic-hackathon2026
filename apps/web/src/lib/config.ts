import { WS_PATH } from '@tectonic/shared';

/** Absolute API origin for native shells / split deployments. Empty means same-origin. */
export const API_ORIGIN = ((import.meta.env.VITE_API_ORIGIN as string | undefined) ?? '').replace(/\/+$/, '');

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
