/**
 * Deterministic demo identities used by the local auth bypass and the seed data.
 * They never exist in Clerk.
 */
export interface DemoUser {
  id: string;
  name: string;
  email: string;
  color: string;
  handle: string;
}

export const DEMO_USERS: readonly DemoUser[] = [
  { id: 'demo_wanne', name: 'Wanne Van Camp', email: 'wanne@sdworx.example', color: '#4f46e5', handle: 'wanne' },
  { id: 'demo_roy', name: 'Roy Heerkens', email: 'roy@sdworx.example', color: '#0ea5e9', handle: 'roy' },
  { id: 'demo_sebastien', name: 'Sebastien De Couvreur', email: 'sebastien@sdworx.example', color: '#10b981', handle: 'sebastien' },
];

export const DEFAULT_DEMO_USER_ID = 'demo_wanne';

/** Header (HTTP) carrying the chosen demo identity when the dev bypass is active. */
export const DEV_USER_HEADER = 'x-dev-user';

export function findDemoUser(idOrHandle: string | null | undefined): DemoUser | undefined {
  if (!idOrHandle) return undefined;
  return DEMO_USERS.find((u) => u.id === idOrHandle || u.handle === idOrHandle);
}
