import { useQueryClient } from '@tanstack/react-query';
import { TASK_STATUS_LABELS, type PresenceUser } from '@tectonic/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../auth/context.ts';
import { useToasts } from '../components/Toasts.tsx';
import { wsUrl } from '../lib/config.ts';
import { keys, removeTaskFromCache, upsertTaskInCache } from '../lib/queries.ts';
import { RealtimeClient, type ConnectionStatus } from '../lib/realtime.ts';

interface RealtimeContextValue {
  status: ConnectionStatus;
  presence: Record<string, PresenceUser[]>;
  /** Task ids changed by *other* sessions recently, for the highlight animation. */
  recentlyChanged: Record<string, number>;
  subscribe(projectId: string): () => void;
  lastReconnectAt: number | null;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime(): RealtimeContextValue {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return value;
}

/** Subscribes to a project for as long as the component is mounted. */
export function useProjectSubscription(projectId: string | null) {
  const { subscribe } = useRealtime();
  useEffect(() => {
    if (!projectId) return;
    return subscribe(projectId);
  }, [projectId, subscribe]);
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const qc = useQueryClient();
  const toasts = useToasts();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [presence, setPresence] = useState<Record<string, PresenceUser[]>>({});
  const [recentlyChanged, setRecentlyChanged] = useState<Record<string, number>>({});
  const [lastReconnectAt, setLastReconnectAt] = useState<number | null>(null);
  const clientRef = useRef<RealtimeClient | null>(null);

  const client = useMemo(() => {
    clientRef.current?.close();
    const next = new RealtimeClient({ url: wsUrl, getAuth: session.getWsAuth });
    clientRef.current = next;
    return next;
  }, [session]);

  useEffect(() => {
    const offStatus = client.onStatus(setStatus);
    const offPresence = client.onPresence(({ projectId, users }) => setPresence((old) => ({ ...old, [projectId]: users })));
    const offReconnect = client.onReconnect(() => {
      // We may have missed events while disconnected: refetch everything that is on screen.
      setLastReconnectAt(Date.now());
      void qc.invalidateQueries();
      toasts.push({ kind: 'info', title: 'Back online', message: 'Reloaded the latest changes.' });
    });
    const offError = client.onError((error) => {
      if (error.code === 'forbidden' && error.projectId) {
        void qc.invalidateQueries({ queryKey: keys.projects });
        void qc.invalidateQueries({ queryKey: keys.project(error.projectId) });
        toasts.push({ kind: 'warning', title: 'Access changed', message: error.message });
      }
    });
    const offEvent = client.onEvent(({ projectId, actorId, event }) => {
      const remote = actorId !== session.user.id;
      const markChanged = (taskId: string) => {
        if (!remote) return;
        setRecentlyChanged((old) => ({ ...old, [taskId]: Date.now() }));
        setTimeout(() => setRecentlyChanged((old) => {
          const { [taskId]: _dropped, ...rest } = old;
          return rest;
        }), 2_500);
      };
      switch (event.kind) {
        case 'task.created':
          upsertTaskInCache(qc, event.task);
          markChanged(event.task.id);
          if (remote) toasts.push({ kind: 'live', title: actorName(presenceRef.current[projectId], actorId), message: `added “${event.task.title}”` });
          break;
        case 'task.updated': {
          const before = qc.getQueryData<{ tasks: Array<{ id: string; status: string }> }>(keys.project(projectId))?.tasks.find((t) => t.id === event.task.id);
          upsertTaskInCache(qc, event.task);
          markChanged(event.task.id);
          if (remote && before && before.status !== event.task.status) {
            toasts.push({ kind: 'live', title: actorName(presenceRef.current[projectId], actorId), message: `moved “${event.task.title}” to ${TASK_STATUS_LABELS[event.task.status]}` });
          }
          break;
        }
        case 'task.deleted':
          removeTaskFromCache(qc, projectId, event.taskId);
          break;
        case 'project.updated':
        case 'members.changed':
          void qc.invalidateQueries({ queryKey: keys.project(projectId) });
          void qc.invalidateQueries({ queryKey: keys.projects });
          break;
        case 'project.deleted':
          qc.removeQueries({ queryKey: keys.project(projectId) });
          void qc.invalidateQueries({ queryKey: keys.projects });
          if (remote) toasts.push({ kind: 'warning', title: 'Project deleted', message: 'This project was deleted by another member.' });
          break;
      }
      void qc.invalidateQueries({ queryKey: keys.projects });
    });
    client.connect();
    return () => {
      offStatus();
      offPresence();
      offReconnect();
      offError();
      offEvent();
      client.close();
    };
  }, [client, qc, session.user.id, toasts]);

  const presenceRef = useRef(presence);
  presenceRef.current = presence;

  // Stable identity: components subscribe in an effect keyed on this function, so it must not
  // change whenever presence/status state changes (that would unsubscribe/resubscribe in a loop).
  const subscribe = useCallback((projectId: string) => client.subscribe(projectId), [client]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ status, presence, recentlyChanged, subscribe, lastReconnectAt }),
    [status, presence, recentlyChanged, subscribe, lastReconnectAt],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

function actorName(users: PresenceUser[] | undefined, actorId: string | null): string {
  return users?.find((u) => u.userId === actorId)?.name ?? 'Someone';
}
