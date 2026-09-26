import { Router, type Request, type Response } from 'express';
import { authenticate, scopeData } from '../../middleware/auth';
import { ok, fail } from '../../lib/response';
import type { Role } from '@prisma/client';
import { getSalesReport, getMarketingReport, type Actor } from './reports.service';

const router = Router({ mergeParams: true });

function actorOf(req: Request): Actor {
  const r = req as unknown as { user?: { id: string; role: Role; managerId?: string | null } };
  if (!r.user) throw Object.assign(new Error('Unauthenticated'), { code: 'UNAUTHORIZED', status: 401 });
  return { id: r.user.id, role: r.user.role, managerId: r.user.managerId };
}

function handleError(res: Response, err: unknown): void {
  const e = err as { code?: string; status?: number; message?: string; errors?: unknown };
  if (e.code === 'NOT_FOUND') { fail(res, 404, { code: 'NOT_FOUND', message: e.message || 'Not found' }); return; }
  if (e.code === 'FORBIDDEN') { fail(res, 403, { code: 'FORBIDDEN', message: e.message || 'Forbidden' }); return; }
  if (e.code === 'BAD_REQUEST') { fail(res, 400, { code: 'BAD_REQUEST', message: e.message || 'Bad request' }); return; }
  if (e.code === 'VALIDATION_ERROR') {
    fail(res, 400, { code: 'VALIDATION_ERROR', message: e.message || 'Validation failed', details: e.errors }); return;
  }
  if (e.code === 'CONFLICT') { fail(res, 409, { code: 'CONFLICT', message: e.message || 'Conflict' }); return; }
  if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'ZodError') {
    fail(res, 400, { code: 'VALIDATION_ERROR', message: 'Validation failed', details: (e as unknown as { issues: unknown }).issues }); return;
  }
  fail(res, 500, { code: 'INTERNAL_SERVER_ERROR', message: (e as Error).message || 'Internal server error' });
}

/* ─── GET /api/reports/sales ───────────────────────────────────────────── */
router.get('/sales', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await getSalesReport(actorOf(req), req.visibleUserIds ?? null, req.query as Record<string, unknown>);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

/* ─── GET /api/reports/marketing ───────────────────────────────────────── */
router.get('/marketing', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await getMarketingReport(actorOf(req), req.visibleUserIds ?? null, req.query as Record<string, unknown>);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;
