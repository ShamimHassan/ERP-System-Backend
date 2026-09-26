import type { Response } from 'express';
import { z } from 'zod';
import { fail } from './response';

/**
 * Shared route-level error handler.
 *
 * Handles ZodError, known service errors (NOT_FOUND, FORBIDDEN, CONFLICT, etc.)
 * and falls back to 500 for unexpected errors.
 *
 * Usage in routes:
 *   } catch (err) { return handleError(res, err); }
 */
export function handleError(res: Response, err: unknown): void {
  // Zod validation errors (thrown by service schema.parse())
  if (err instanceof z.ZodError) {
    const details = err.issues.map((i) => ({
      field: i.path.join('.') || 'body',
      message: i.message,
    }));
    fail(res, 400, { code: 'VALIDATION_ERROR', message: 'Request validation failed', details });
    return;
  }

  const e = err as {
    code?: string;
    status?: number;
    message?: string;
    errors?: unknown;
  };

  const status  = typeof e?.status === 'number' ? e.status : 500;
  const code    = typeof e?.code   === 'string'  ? e.code   : status === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';

  switch (code) {
    case 'NOT_FOUND':
      fail(res, 404, { code: 'NOT_FOUND', message }); break;
    case 'FORBIDDEN':
      fail(res, 403, { code: 'FORBIDDEN', message }); break;
    case 'UNAUTHORIZED':
      fail(res, 401, { code: 'UNAUTHORIZED', message }); break;
    case 'CONFLICT':
      fail(res, 409, { code: 'CONFLICT', message }); break;
    case 'APPROVAL_REQUIRED':
      fail(res, 409, { code: 'APPROVAL_REQUIRED', message }); break;
    case 'VALIDATION_ERROR':
      fail(res, 400, { code: 'VALIDATION_ERROR', message, details: e.errors }); break;
    case 'BAD_REQUEST':
      fail(res, 400, { code: 'BAD_REQUEST', message }); break;
    default:
      fail(res, status >= 400 && status < 600 ? status : 500, { code, message });
  }
}
