import { Router, type Request, type Response } from 'express';
import { authenticate, authorize, scopeData } from '../../middleware/auth';
import { validate, listQuerySchema } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import type { Role } from '@prisma/client';
import { getKpis, listTargets, setTarget, createTargetSchema, type Actor } from './kpis.service';

const router = Router({ mergeParams: true });

function actorOf(req: Request): Actor {
  const r = req as unknown as { user?: { id: string; role: Role; managerId?: string | null } };
  if (!r.user) throw Object.assign(new Error('Unauthenticated'), { code: 'UNAUTHORIZED', status: 401 });
  return { id: r.user.id, role: r.user.role, managerId: r.user.managerId, ip: req.ip ?? null };
}

// GET /api/kpis
router.get('/', authenticate, scopeData(), validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const { rows, meta } = await getKpis(actorOf(req), req.visibleUserIds ?? null, (req.parsedQuery ?? req.query) as Record<string, unknown>);
    return ok(res, rows, meta);
  } catch (err) { return handleError(res, err); }
});

// GET /api/kpis/targets
router.get('/targets', authenticate, scopeData(), validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const { data, meta } = await listTargets(actorOf(req), (req.parsedQuery ?? req.query) as Record<string, unknown>);
    return ok(res, data, meta);
  } catch (err) { return handleError(res, err); }
});

// POST /api/kpis/targets — Admin / Manager only
router.post(
  '/targets',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  scopeData(),
  validate(createTargetSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await setTarget(actorOf(req), req.body);
      return ok(res, {
        id:           result.target.id,
        userId:       result.target.userId,
        periodType:   result.target.periodType,
        periodStart:  result.target.periodStart.toISOString().slice(0, 10),
        periodEnd:    result.target.periodEnd.toISOString().slice(0, 10),
        metric:       result.target.metric,
        targetValue:  Number(result.target.targetValue),
        created:      result.created,
      });
    } catch (err) { return handleError(res, err); }
  }
);

export default router;

