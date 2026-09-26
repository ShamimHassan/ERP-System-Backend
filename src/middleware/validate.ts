import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { fail } from '../lib/response';

type Target = 'body' | 'query' | 'params';

/**
 * validate(schema, target?)
 *
 * Express middleware that parses req[target] through a Zod schema.
 * On failure → 400 VALIDATION_ERROR with per-field details.
 * On success → attaches the parsed (coerced/stripped) value back onto req[target]
 * so downstream handlers receive cleaned data.
 *
 * Default target: 'body'
 */
export function validate(schema: z.ZodTypeAny, target: Target = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || target,
        message: issue.message,
      }));
      fail(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
      });
      return;
    }
    // Write the coerced/parsed value back so handlers get clean types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[target] = result.data;
    next();
  };
}

/* ─── Common list-query schema (shared across all GET list endpoints) ─── */
export const listQuerySchema = z.object({
  page:    z.coerce.number().int().min(1).max(10000).optional(),
  limit:   z.coerce.number().int().min(1).max(100).optional(),
  sort:    z.string().max(100).optional(),
  search:  z.string().max(200).optional(),
  status:  z.string().max(50).optional(),
  dateFrom: z.string().date().optional(),
  dateTo:   z.string().date().optional(),
}).passthrough(); // allow module-specific filters through
