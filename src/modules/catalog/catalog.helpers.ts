import { type Response } from 'express';
import { z } from 'zod';
import { fail } from '../../lib/response';

/** Unified error handler for catalog routes — same shape as users module */
export function handleError(res: Response, err: unknown): void {
  if (err instanceof z.ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    fail(res, 400, { code: 'VALIDATION_ERROR', message: 'Request validation failed', details });
    return;
  }

  const status =
    err && typeof err === 'object' && 'status' in err
      ? Number((err as { status: unknown }).status) || 500
      : 500;
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : status === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
  const message =
    err instanceof Error ? err.message : status === 500 ? 'An unexpected error occurred' : 'Bad request';

  fail(res, status, { code, message });
}
