import { Router, type Request, type Response } from 'express';
import { authenticate, scopeData } from '../../middleware/auth';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import type { Role } from '@prisma/client';
import { getSummary, getTeamPerformance, type Actor } from './dashboard.service';

const router = Router({ mergeParams: true });

function actorOf(req: Request): Actor {
  const r = req as unknown as { user?: { id: string; role: Role; managerId?: string | null } };
  if (!r.user) throw Object.assign(new Error('Unauthenticated'), { code: 'UNAUTHORIZED', status: 401 });
  return { id: r.user.id, role: r.user.role, managerId: r.user.managerId, ip: req.ip ?? null };
}

// GET /api/dashboard/summary
router.get('/summary', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await getSummary(actorOf(req), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// GET /api/dashboard/team-performance
router.get('/team-performance', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await getTeamPerformance(actorOf(req), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;
