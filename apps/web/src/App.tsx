import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { AuthProvider } from './auth/AuthProvider.tsx';
import { useSession } from './auth/context.ts';
import { AppShell } from './components/AppShell.tsx';
import { ToastProvider } from './components/Toasts.tsx';
import { RealtimeProvider } from './realtime/RealtimeProvider.tsx';

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <SessionScopedApp />
      </AuthProvider>
    </ToastProvider>
  );
}

/**
 * The query cache belongs to one identity. Switching users (dev bypass) or
 * signing in as someone else gets a fresh client, so no data or permissions
 * from the previous person linger on screen.
 */
function SessionScopedApp() {
  const session = useSession();
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: 1 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on identity on purpose
    [session.user.id],
  );
  return (
    <QueryClientProvider client={queryClient} key={session.user.id}>
      <RealtimeProvider>
        <AppShell />
      </RealtimeProvider>
    </QueryClientProvider>
  );
}
