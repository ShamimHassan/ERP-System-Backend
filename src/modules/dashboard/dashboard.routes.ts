import { Router, type Request, type Response } from 'express';
import { authenticate, scopeData } from '../../middleware/auth';
import { ok } from '../../lib/response';
import type { Role } from '@prisma/client';
import { getSummary, getTeamPerformance, type Actor } from './dashboard.service';

const router = Router({ mergeParams: true });

/* extract Actor from the auth middleware-annotated Request */
function actorOf(req: Request): Actor {
  const r = req as unknown as { user?: { id: string; role: Role; managerId?: string | null } };
  if (!r.user) throw Object.assign(new Error('Unauthenticated'), { code: 'UNAUTHORIZED', status: 401 });
  return { id: r.user.id, role: r.user.role, managerId: r.user.managerId, ip: req.ip ?? null };
}

function handleError(res: Response, err: unknown): Response {
  const e = err as { code?: string; status?: number; message?: string; errors?: unknown };
  if (e.code === 'NOT_FOUND') return res.status(404).json({ ok: false, error: e.message || 'Not found' });
  if (e.code === 'FORBIDDEN') return res.status(403).json({ ok: false, error: e.message || 'Forbidden' });
  if (e.code === 'BAD_REQUEST') return res.status(400).json({ ok: false, error: e.message || 'Bad request' });
  if (e.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ ok: false, error: e.message || 'Validation failed', details: e.errors });
  }
  if (e.code === 'CONFLICT') return res.status(409).json({ ok: false, error: e.message || 'Conflict' });
  if (e.code === 'APPROVAL_REQUIRED') return res.status(409).json({ ok: false, error: e.message || 'Approval required' });
  if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'ZodError') {
    return res.status(400).json({ ok: false, error: 'Validation failed', details: (e as unknown as { issues: unknown }).issues });
  }
  return res.status(500).json({ ok: false, error: (e as Error).message || 'Internal server error' });
}

// GET /api/dashboard/summary  (authenticated, any role – shape adapted by role)
router.get('/summary', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await getSummary(actorOf(req), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// GET /api/dashboard/team-performance  (Manager / Admin only)
router.get('/team-performance', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await getTeamPerformance(actorOf(req), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;
