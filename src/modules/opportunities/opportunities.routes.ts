import { Router, type Request, type Response } from 'express';
import { authenticate, scopeData } from '../../middleware/auth';
import { validate, listQuerySchema } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import type { Role } from '@prisma/client';
import {
  listOpportunities, getOpportunity, createOpportunity, updateOpportunity,
  createOpportunitySchema, updateOpportunitySchema,
} from './opportunities.service';

const router = Router();

// GET /api/opportunities
router.get('/', authenticate, scopeData(), validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const result = await listOpportunities((req.parsedQuery ?? req.query) as Record<string, unknown>, req.visibleUserIds ?? null);
    return ok(res, result.data, result.meta);
  } catch (err) { return handleError(res, err); }
});

// POST /api/opportunities
router.post('/', authenticate, scopeData(), validate(createOpportunitySchema), async (req: Request, res: Response) => {
  try {
    const result = await createOpportunity(req.body, {
      id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null,
    });
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// GET /api/opportunities/:id
router.get('/:id', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await getOpportunity(String(req.params.id), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// PATCH /api/opportunities/:id
router.patch('/:id', authenticate, scopeData(), validate(updateOpportunitySchema), async (req: Request, res: Response) => {
  try {
    const result = await updateOpportunity(
      String(req.params.id), req.body,
      { id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null },
      req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;

