import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { fail } from '../lib/response';

type Target = 'body' | 'query' | 'params';

// Extend Express Request to carry the parsed/coerced query
declare global {
  namespace Express {
    interface Request {
      parsedQuery?: Record<string, unknown>;
    }
  }
}

/**
 * validate(schema, target?)
 *
 * Express middleware that parses req[target] through a Zod schema.
 * On failure → 400 VALIDATION_ERROR with per-field details.
 *
 * For 'body'  → writes coerced data back to req.body (writable in Express 5)
 * For 'query' → stores coerced data on req.parsedQuery (req.query is readonly in Express 5)
 * For 'params'→ writes back to req.params
 *
 * Default target: 'body'
 */
export function validate(schema: z.ZodTypeAny, target: Target = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const source = target === 'query' ? req.query : req[target];
    const result = schema.safeParse(source);
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

    if (target === 'body' || target === 'params') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any)[target] = result.data;
    } else {
      // req.query is readonly in Express 5 — store on req.parsedQuery instead
      req.parsedQuery = result.data as Record<string, unknown>;
    }
    next();
  };
}

/* ─── Common list-query schema (shared across all GET list endpoints) ─── */
export const listQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).max(10000).optional(),
  limit:    z.coerce.number().int().min(1).max(100).optional(),
  // sort: comma-separated field names, optional leading '-' for desc
  // e.g. "-createdAt,name"  — only allow safe chars
  sort:     z.string().max(100).regex(/^[a-zA-Z0-9_,.\- ]+$/, 'Invalid sort value').optional(),
  search:   z.string().max(200).optional(),
  status:   z.string().max(50).optional(),
  dateFrom: z.string().date('dateFrom must be YYYY-MM-DD').optional(),
  dateTo:   z.string().date('dateTo must be YYYY-MM-DD').optional(),
}).passthrough(); // allow module-specific filters (managerId, priority, etc.) through
