import { Suspense, lazy, type ReactNode } from 'react';
import { AUTH_MODE } from '../lib/config.ts';
import { DevAuthProvider } from './DevAuthProvider.tsx';

// Clerk's SDK is only downloaded when the build is configured for it.
const ClerkAuthProvider = lazy(() => import('./ClerkAuthProvider.tsx').then((m) => ({ default: m.ClerkAuthProvider })));

export function AuthProvider({ children }: { children: ReactNode }) {
  if (AUTH_MODE === 'clerk') {
    return (
      <Suspense fallback={<div className="screen-center muted">Loading sign-in…</div>}>
        <ClerkAuthProvider>{children}</ClerkAuthProvider>
      </Suspense>
    );
  }
  return <DevAuthProvider>{children}</DevAuthProvider>;
}
