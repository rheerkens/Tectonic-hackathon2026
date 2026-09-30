import { ApiErrorBodySchema, api, buildPath, type ApiContracts, type ApiErrorCode, type ApiRouteName, type PathParams } from '@tectonic/shared';
import type { z } from 'zod';
import { apiUrl } from './config.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'network' | 'unexpected',
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Params<R extends ApiRouteName> = PathParams<ApiContracts[R]['path']>;
type Body<R extends ApiRouteName> = ApiContracts[R]['body'] extends z.ZodTypeAny ? z.input<ApiContracts[R]['body']> : never;
type Result<R extends ApiRouteName> = z.infer<ApiContracts[R]['response']>;

export type AuthHeaders = () => Promise<Record<string, string>>;

/**
 * Typed client generated from the shared contracts: paths, bodies and
 * responses all come from `@tectonic/shared`, so a contract change fails the
 * type check on both sides.
 */
export function createApiClient(getAuthHeaders: AuthHeaders) {
  async function request<R extends ApiRouteName>(name: R, params: Params<R>, body?: Body<R>): Promise<Result<R>> {
    const contract = api[name];
    const url = apiUrl(buildPath(contract.path, params as PathParams<typeof contract.path>));
    const headers: Record<string, string> = { accept: 'application/json', ...(await getAuthHeaders()) };
    if (body !== undefined) headers['content-type'] = 'application/json';

    let response: Response;
    try {
      response = await fetch(url, { method: contract.method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (error) {
      throw new ApiError(0, 'network', `Could not reach the server (${error instanceof Error ? error.message : 'network error'})`);
    }

    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const parsed = ApiErrorBodySchema.safeParse(json);
      if (parsed.success) throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.details);
      throw new ApiError(response.status, 'unexpected', `Request failed with status ${response.status}`);
    }

    const result = contract.response.safeParse(json);
    if (!result.success) throw new ApiError(response.status, 'unexpected', `Unexpected response shape for ${name}`, result.error.issues);
    return result.data as Result<R>;
  }

  return {
    request,
    health: () => request('health', {}),
    me: () => request('me', {}),
    listUsers: () => request('listUsers', {}),
    access: () => request('access', {}),
    listSources: () => request('listSources', {}),
    ask: (body: Body<'ask'>) => request('ask', {}, body),
    naiveAnswer: (body: Body<'naiveAnswer'>) => request('naiveAnswer', {}, body),
    check: (body: Body<'check'>) => request('check', {}, body),
    approveSource: (sourceId: string) => request('approveSource', { sourceId }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
