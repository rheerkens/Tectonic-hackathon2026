import { zValidator } from '@hono/zod-validator';
import type { z } from 'zod';

/** JSON body validation that reports errors in the shared `ApiErrorBody` shape. */
export function jsonBody<T extends z.ZodTypeAny>(schema: T) {
  return zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'validation_failed',
            message: result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '),
            details: result.error.issues,
          },
        },
        400,
      );
    }
    return undefined;
  });
}
