import { API_ERROR_STATUS, type ApiErrorBody, type ApiErrorCode } from '@tectonic/shared';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = API_ERROR_STATUS[code];
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, ...(this.details !== undefined ? { details: this.details } : {}) } };
  }
}

export const unauthorized = (message = 'Authentication required') => new ApiError('unauthorized', message);
export const forbidden = (message = 'You do not have access to this resource') => new ApiError('forbidden', message);
export const notFound = (what = 'Resource') => new ApiError('not_found', `${what} not found`);
export const badRequest = (message: string, details?: unknown) => new ApiError('bad_request', message, details);
export const conflict = (message: string) => new ApiError('conflict', message);
