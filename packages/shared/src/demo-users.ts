/**
 * Deterministic demo identities used by the local auth bypass, the seed data,
 * the automated tests and the video walkthrough. They never exist in Clerk.
 */
export interface DemoUser {
  id: string;
  name: string;
  email: string;
  color: string;
  handle: string;
}

export const DEMO_USERS: readonly DemoUser[] = [
  { id: 'demo_ada', name: 'Ada Lovelace', email: 'ada@demo.tectonic.local', color: '#6366f1', handle: 'ada' },
  { id: 'demo_grace', name: 'Grace Hopper', email: 'grace@demo.tectonic.local', color: '#0ea5e9', handle: 'grace' },
  { id: 'demo_margaret', name: 'Margaret Hamilton', email: 'margaret@demo.tectonic.local', color: '#f59e0b', handle: 'margaret' },
  { id: 'demo_alan', name: 'Alan Turing', email: 'alan@demo.tectonic.local', color: '#10b981', handle: 'alan' },
];

export const DEFAULT_DEMO_USER_ID = 'demo_ada';

/** Header (HTTP) carrying the chosen demo identity when the dev bypass is active. */
export const DEV_USER_HEADER = 'x-dev-user';

export function findDemoUser(idOrHandle: string | null | undefined): DemoUser | undefined {
  if (!idOrHandle) return undefined;
  return DEMO_USERS.find((u) => u.id === idOrHandle || u.handle === idOrHandle);
}
