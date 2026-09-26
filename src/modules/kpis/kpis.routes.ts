import { Router, type Request, type Response } from 'express';
import { authenticate, authorize, scopeData } from '../../middleware/auth';
import { ok, fail } from '../../lib/response';
import type { Role, PeriodType, Metric } from '@prisma/client';
import { getKpis, listTargets, setTarget, type Actor } from './kpis.service';

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
  if (e.code === 'APPROVAL_REQUIRED') { fail(res, 409, { code: 'APPROVAL_REQUIRED', message: e.message || 'Approval required' }); return; }
  if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'ZodError') {
    fail(res, 400, { code: 'VALIDATION_ERROR', message: 'Validation failed', details: (e as unknown as { issues: unknown }).issues }); return;
  }
  fail(res, 500, { code: 'INTERNAL_SERVER_ERROR', message: (e as Error).message || 'Internal server error' });
}

/* ─── GET /api/kpis — compute on-demand KPI rows (actual + target + pct) ─── */
router.get('/', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const { rows, meta } = await getKpis(actorOf(req), req.visibleUserIds ?? null, req.query as Record<string, unknown>);
    return ok(res, rows, meta);
  } catch (err) { return handleError(res, err); }
});

/* ─── GET /api/kpis/targets — list stored targets (scoped) ─────────────── */
router.get('/targets', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const { data, meta } = await listTargets(actorOf(req), req.query as Record<string, unknown>);
    return ok(res, data, meta);
  } catch (err) { return handleError(res, err); }
});

/* ─── POST /api/kpis/targets — upsert a target (Admin / Manager only) ─── */
router.post('/targets', authenticate, authorize(['ADMIN', 'MANAGER']), scopeData(), async (req: Request, res: Response) => {
  try {
    const b = req.body as { userId: string; periodType: PeriodType; periodStart: string; metric: Metric; targetValue: number };
    if (!b.userId || !b.periodType || !b.periodStart || !b.metric || b.targetValue == null) {
      return fail(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Missing fields: userId, periodType, periodStart, metric, targetValue required',
      });
    }
    const result = await setTarget(actorOf(req), b);
    return ok(res, {
      id: result.target.id,
      userId: result.target.userId,
      periodType: result.target.periodType,
      periodStart: result.target.periodStart.toISOString().slice(0, 10),
      periodEnd: result.target.periodEnd.toISOString().slice(0, 10),
      metric: result.target.metric,
      targetValue: Number(result.target.targetValue),
      created: result.created,
    });
  } catch (err) { return handleError(res, err); }
});

export default router;
