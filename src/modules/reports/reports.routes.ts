import { Router, type Request, type Response } from 'express';
import { authenticate, scopeData } from '../../middleware/auth';
import { validate, listQuerySchema } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import type { Role } from '@prisma/client';
import { getSalesReport, getMarketingReport, type Actor } from './reports.service';

const router = Router({ mergeParams: true });

function actorOf(req: Request): Actor {
  const r = req as unknown as { user?: { id: string; role: Role; managerId?: string | null } };
  if (!r.user) throw Object.assign(new Error('Unauthenticated'), { code: 'UNAUTHORIZED', status: 401 });
  return { id: r.user.id, role: r.user.role, managerId: r.user.managerId, ip: req.ip ?? null };
}

// GET /api/reports/sales
router.get('/sales', authenticate, scopeData(), validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const result = await getSalesReport(actorOf(req), req.visibleUserIds ?? null, (req.parsedQuery ?? req.query) as Record<string, unknown>);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// GET /api/reports/marketing
router.get('/marketing', authenticate, scopeData(), validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const result = await getMarketingReport(actorOf(req), req.visibleUserIds ?? null, (req.parsedQuery ?? req.query) as Record<string, unknown>);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;

