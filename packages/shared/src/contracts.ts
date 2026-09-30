import { z } from 'zod';
import {
  AddMemberInputSchema,
  AskInputSchema,
  AskResultSchema,
  CreateSourceInputSchema,
  FlagSourceInputSchema,
  SourcesOverviewSchema,
  SourceWithTrustSchema,
  CreateProjectInputSchema,
  CreateTaskInputSchema,
  HealthSchema,
  MeSchema,
  OkSchema,
  ProjectDetailSchema,
  ProjectMemberSchema,
  ProjectSchema,
  ProjectSummarySchema,
  TaskSchema,
  UpdateProjectInputSchema,
  UpdateTaskInputSchema,
  UserSchema,
} from './schemas.ts';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Extracts `{ projectId: string }` from `'/api/projects/:projectId'`. */
export type PathParams<P extends string> = P extends `${string}:${infer Param}/${infer Rest}`
  ? { [K in Param | keyof PathParams<Rest>]: string }
  : P extends `${string}:${infer Param}`
    ? { [K in Param]: string }
    : Record<never, never>;

export interface RouteContract<
  Path extends string,
  Body extends z.ZodTypeAny | undefined,
  Response extends z.ZodTypeAny,
> {
  method: HttpMethod;
  path: Path;
  body: Body;
  response: Response;
}

function route<Path extends string, Body extends z.ZodTypeAny | undefined, Response extends z.ZodTypeAny>(
  method: HttpMethod,
  path: Path,
  spec: { body?: Body; response: Response },
): RouteContract<Path, Body, Response> {
  return { method, path, body: spec.body as Body, response: spec.response };
}

/**
 * Single source of truth for the HTTP API. The Hono server mounts these paths
 * and validates bodies with the same schemas; the web client builds requests
 * from them and parses responses with `response`.
 */
export const api = {
  health: route('GET', '/api/health', { response: HealthSchema }),
  me: route('GET', '/api/me', { response: MeSchema }),
  listUsers: route('GET', '/api/users', { response: UserSchema.array() }),

  listProjects: route('GET', '/api/projects', { response: ProjectSummarySchema.array() }),
  createProject: route('POST', '/api/projects', { body: CreateProjectInputSchema, response: ProjectSummarySchema }),
  getProject: route('GET', '/api/projects/:projectId', { response: ProjectDetailSchema }),
  updateProject: route('PATCH', '/api/projects/:projectId', { body: UpdateProjectInputSchema, response: ProjectSchema }),
  deleteProject: route('DELETE', '/api/projects/:projectId', { response: OkSchema }),

  addMember: route('POST', '/api/projects/:projectId/members', { body: AddMemberInputSchema, response: ProjectMemberSchema }),
  removeMember: route('DELETE', '/api/projects/:projectId/members/:userId', { response: OkSchema }),

  createTask: route('POST', '/api/projects/:projectId/tasks', { body: CreateTaskInputSchema, response: TaskSchema }),
  updateTask: route('PATCH', '/api/projects/:projectId/tasks/:taskId', { body: UpdateTaskInputSchema, response: TaskSchema }),
  deleteTask: route('DELETE', '/api/projects/:projectId/tasks/:taskId', { response: OkSchema }),

  listSources: route('GET', '/api/projects/:projectId/sources', { response: SourcesOverviewSchema }),
  createSource: route('POST', '/api/projects/:projectId/sources', { body: CreateSourceInputSchema, response: SourceWithTrustSchema }),
  ask: route('POST', '/api/projects/:projectId/ask', { body: AskInputSchema, response: AskResultSchema }),
  verifySource: route('POST', '/api/projects/:projectId/sources/:sourceId/verify', { response: SourceWithTrustSchema }),
  flagSource: route('POST', '/api/projects/:projectId/sources/:sourceId/flag', { body: FlagSourceInputSchema, response: SourceWithTrustSchema }),
} as const;

export type ApiContracts = typeof api;
export type ApiRouteName = keyof ApiContracts;

/** Fill `:param` placeholders. Values are URL-encoded. */
export function buildPath<P extends string>(path: P, params: PathParams<P>): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    const value = (params as Record<string, string>)[key];
    if (value === undefined) throw new Error(`Missing path parameter "${key}" for ${path}`);
    return encodeURIComponent(value);
  });
}
