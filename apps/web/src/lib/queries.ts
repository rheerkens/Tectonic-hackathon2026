import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProjectInput, CreateTaskInput, ProjectDetail, ProjectSummary, Task, UpdateProjectInput, UpdateTaskInput } from '@tectonic/shared';
import { sortTasks } from '@tectonic/shared';
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
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
};

export function useMe() {
  const api = useApiClient();
  return useQuery({ queryKey: keys.me, queryFn: api.me, staleTime: 60_000, retry: 1 });
}

export function useUsers() {
  const api = useApiClient();
  return useQuery({ queryKey: keys.users, queryFn: api.listUsers, staleTime: 60_000 });
}

export function useProjects() {
  const api = useApiClient();
  return useQuery({ queryKey: keys.projects, queryFn: api.listProjects });
}

export function useProject(projectId: string | null) {
  const api = useApiClient();
  return useQuery({
    queryKey: keys.project(projectId ?? 'none'),
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
    retry: (failureCount, error) => {
      const status = (error as { status?: number }).status;
      return status !== 403 && status !== 404 && failureCount < 2;
    },
  });
}

export function useCreateProject() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.createProject(input),
    onSuccess: (project) => {
      qc.setQueryData<ProjectSummary[]>(keys.projects, (old) => [...(old ?? []), project]);
    },
  });
}

export function useUpdateProject(projectId: string) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => api.updateProject(projectId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.projects });
      void qc.invalidateQueries({ queryKey: keys.project(projectId) });
    },
  });
}

export function useDeleteProject() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api.deleteProject(projectId),
    onSuccess: (_result, projectId) => {
      qc.setQueryData<ProjectSummary[]>(keys.projects, (old) => (old ?? []).filter((p) => p.id !== projectId));
      qc.removeQueries({ queryKey: keys.project(projectId) });
    },
  });
}

export function useAddMember(projectId: string) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; role: 'viewer' | 'editor' | 'owner' }) => api.addMember(projectId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.project(projectId) });
      void qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useRemoveMember(projectId: string) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeMember(projectId, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.project(projectId) });
      void qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

/** Cache helpers shared by mutations and realtime events. */
export function upsertTaskInCache(qc: ReturnType<typeof useQueryClient>, task: Task) {
  qc.setQueryData<ProjectDetail>(keys.project(task.projectId), (old) => {
    if (!old) return old;
    const others = old.tasks.filter((t) => t.id !== task.id);
    const existing = old.tasks.find((t) => t.id === task.id);
    if (existing && existing.version > task.version) return old; // stale event
    return { ...old, tasks: sortTasks([...others, task]) };
  });
}

export function removeTaskFromCache(qc: ReturnType<typeof useQueryClient>, projectId: string, taskId: string) {
  qc.setQueryData<ProjectDetail>(keys.project(projectId), (old) => (old ? { ...old, tasks: old.tasks.filter((t) => t.id !== taskId) } : old));
}

export function useCreateTask(projectId: string) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => api.createTask(projectId, input),
    onSuccess: (task) => {
      upsertTaskInCache(qc, task);
      void qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useUpdateTask(projectId: string) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: UpdateTaskInput }) => api.updateTask(projectId, taskId, input),
    // Optimistic move: the card jumps immediately, the server result (or a rollback) follows.
    onMutate: async ({ taskId, input }) => {
      await qc.cancelQueries({ queryKey: keys.project(projectId) });
      const previous = qc.getQueryData<ProjectDetail>(keys.project(projectId));
      if (previous) {
        const task = previous.tasks.find((t) => t.id === taskId);
        if (task) upsertTaskInCache(qc, { ...task, ...input, assigneeId: input.assigneeId === undefined ? task.assigneeId : input.assigneeId } as Task);
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(keys.project(projectId), context.previous);
    },
    onSuccess: (task) => {
      upsertTaskInCache(qc, task);
      void qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useDeleteTask(projectId: string) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.deleteTask(projectId, taskId),
    onSuccess: (_result, taskId) => {
      removeTaskFromCache(qc, projectId, taskId);
      void qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}
