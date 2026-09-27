import { createContext, useContext } from 'react';
import type { AuthSession } from './types.ts';

export const AuthContext = createContext<AuthSession | null>(null);

export function useSession(): AuthSession {
  const session = useContext(AuthContext);
  if (!session) throw new Error('useSession must be used inside <AuthProvider>');
  return session;
}
