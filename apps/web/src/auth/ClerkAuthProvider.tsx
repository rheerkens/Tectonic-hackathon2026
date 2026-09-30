import { ClerkProvider, SignIn, SignedIn, SignedOut, useAuth, useUser } from '@clerk/clerk-react';
import { useMemo, type ReactNode } from 'react';
import { Brand } from '../components/Brand.tsx';
import { CLERK_PUBLISHABLE_KEY } from '../lib/config.ts';
import { AuthContext } from './context.ts';
import type { AuthSession } from './types.ts';

const PALETTE = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#f97316', '#14b8a6'];
function colorForId(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

/**
 * Real authentication through Clerk. Active whenever VITE_CLERK_PUBLISHABLE_KEY
 * is set at build time. Session tokens are sent as `Authorization: Bearer`.
 *
 * Native shells: Clerk's hosted components work inside Capacitor/Tauri web
 * views, but OAuth providers need the app's custom URL scheme registered as an
 * allowed redirect in the Clerk dashboard. See docs/mobile-desktop.md.
 */
export function ClerkAuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
      <SignedOut>
        <main className="identity-screen">
          <div className="identity-card identity-card--clerk">
            <Brand />
            <SignIn routing="hash" />
          </div>
        </main>
      </SignedOut>
      <SignedIn>
        <ClerkSession>{children}</ClerkSession>
      </SignedIn>
    </ClerkProvider>
  );
}

function ClerkSession({ children }: { children: ReactNode }) {
  const { getToken, signOut, userId } = useAuth();
  const { user } = useUser();

  const session = useMemo<AuthSession | null>(() => {
    if (!userId || !user) return null;
    const name = user.fullName || user.username || user.primaryEmailAddress?.emailAddress || userId;
    return {
      mode: 'clerk',
      user: { id: userId, name, email: user.primaryEmailAddress?.emailAddress ?? null, color: colorForId(userId) },
      getAuthHeaders: async (): Promise<Record<string, string>> => {
        const token = await getToken();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
      getWsAuth: async () => ({ token: (await getToken()) ?? undefined }),
      signOut: () => void signOut(),
    };
  }, [userId, user, getToken, signOut]);

  if (!session) return <div className="screen-center muted">Loading your session…</div>;
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}
