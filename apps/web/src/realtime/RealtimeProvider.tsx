import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../auth/context.ts';
import { useToasts } from '../components/Toasts.tsx';
import { wsUrl } from '../lib/config.ts';
import { keys } from '../lib/queries.ts';
import { RealtimeClient, type ConnectionStatus } from '../lib/realtime.ts';

interface RealtimeContextValue {
  status: ConnectionStatus;
  subscribe(projectId: string): () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime(): RealtimeContextValue {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return value;
}

/** Subscribes to these teams for as long as the component is mounted. */
export function useTeamSubscriptions(teamIds: readonly string[]) {
  const { subscribe } = useRealtime();
  const key = teamIds.join(',');
  useEffect(() => {
    const offs = key ? key.split(',').map((id) => subscribe(id)) : [];
    return () => offs.forEach((off) => off());
  }, [key, subscribe]);
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const qc = useQueryClient();
  const toasts = useToasts();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const clientRef = useRef<RealtimeClient | null>(null);

  const client = useMemo(() => {
    clientRef.current?.close();
    const next = new RealtimeClient({ url: wsUrl, getAuth: session.getWsAuth });
    clientRef.current = next;
    return next;
  }, [session]);

  useEffect(() => {
    const offStatus = client.onStatus(setStatus);
    const offReconnect = client.onReconnect(() => {
      // Events may have been missed while offline: refetch what is on screen.
      void qc.invalidateQueries();
      toasts.push({ kind: 'info', title: 'Weer online', message: 'De laatste wijzigingen zijn opgehaald.' });
    });
    const offError = client.onError((error) => {
      if (error.code === 'forbidden') {
        void qc.invalidateQueries({ queryKey: keys.access });
        toasts.push({ kind: 'warning', title: 'Toegang gewijzigd', message: error.message });
      }
    });
    const offEvent = client.onEvent(({ actorId, event }) => {
      if (event.kind === 'sources.changed') {
        void qc.invalidateQueries({ queryKey: keys.asks });
        void qc.invalidateQueries({ queryKey: keys.access });
        if (actorId !== session.user.id) toasts.push({ kind: 'live', title: 'Kennisbank bijgewerkt', message: 'Een collega heeft een bron gewijzigd. Je antwoord is herberekend.' });
      } else {
        void qc.invalidateQueries({ queryKey: keys.access });
      }
    });
    client.connect();
    return () => {
      offStatus();
      offReconnect();
      offError();
      offEvent();
      client.close();
    };
  }, [client, qc, session.user.id, toasts]);

  const subscribe = useCallback((projectId: string) => client.subscribe(projectId), [client]);
  const value = useMemo<RealtimeContextValue>(() => ({ status, subscribe }), [status, subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
