import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AskInput, ChatInput } from '@tectonic/shared';
import { createContext, useContext, useMemo } from 'react';
import { useSession } from '../auth/context.ts';
import { createApiClient, type ApiClient } from './api.ts';

export const ApiContext = createContext<ApiClient | null>(null);

export function useApiClient(): ApiClient {
  const existing = useContext(ApiContext);
  const session = useSession();
  return useMemo(() => existing ?? createApiClient(session.getAuthHeaders), [existing, session]);
}

export const keys = {
  me: ['me'] as const,
  users: ['users'] as const,
  access: ['access'] as const,
  asks: ['ask'] as const,
};

export function useMe() {
  const api = useApiClient();
  return useQuery({ queryKey: keys.me, queryFn: api.me, staleTime: 60_000, retry: 1 });
}

export function useUsers() {
  const api = useApiClient();
  return useQuery({ queryKey: keys.users, queryFn: api.listUsers, staleTime: 60_000 });
}

/** My teams, the clients I may see and example questions. */
export function useAccess() {
  const api = useApiClient();
  return useQuery({ queryKey: keys.access, queryFn: api.access });
}

/** Recomputed whenever sources change: the server publishes `sources.changed` and the realtime layer invalidates this key. */
export function useAsk(input: AskInput | null) {
  const api = useApiClient();
  return useQuery({
    queryKey: [...keys.asks, input],
    queryFn: () => api.ask(input!),
    enabled: input !== null,
    placeholderData: (previous) => previous,
  });
}

/** Refreshed on `sources.changed` via the `asks` key prefix. */
export function useSources() {
  const api = useApiClient();
  return useQuery({ queryKey: [...keys.asks, 'sources'], queryFn: api.listSources });
}

export function useNaiveAnswer(input: AskInput | null, enabled: boolean) {
  const api = useApiClient();
  return useQuery({ queryKey: [...keys.asks, 'naive', input], queryFn: () => api.naiveAnswer(input!), enabled: enabled && input !== null });
}

export function useDisputeSource() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sourceId: string; disputed: boolean }) => api.disputeSource(v.sourceId, { disputed: v.disputed }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.asks }),
  });
}

export function useSupersedeSource() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sourceId: string; supersededBy: string }) => api.supersedeSource(v.sourceId, { supersededBy: v.supersededBy }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.asks }),
  });
}

export function useApproveSource() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => api.approveSource(sourceId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.asks });
      void qc.invalidateQueries({ queryKey: keys.access });
    },
  });
}

/**
 * One chat turn: the server runs the tools and the model and returns the answer with its trace.
 * Nothing is cached or invalidated: a conversation is client state and every answer is a fresh run.
 */
export function useChat() {
  const api = useApiClient();
  return useMutation({ mutationFn: (body: ChatInput) => api.chat(body) });
}
