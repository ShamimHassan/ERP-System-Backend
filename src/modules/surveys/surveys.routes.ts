import { Router, type Request, type Response } from 'express';
import { authenticate, scopeData } from '../../middleware/auth';
import { validate, listQuerySchema } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import type { Role } from '@prisma/client';
import {
  listSurveys, getSurvey, createSurvey, updateSurvey,
  createSurveySchema, updateSurveySchema,
} from './surveys.service';

const router = Router();

// GET /api/surveys
router.get('/', authenticate, scopeData(), validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const result = await listSurveys((req.parsedQuery ?? req.query) as Record<string, unknown>, req.visibleUserIds ?? null);
    return ok(res, result.data, result.meta);
  } catch (err) { return handleError(res, err); }
});

// POST /api/surveys
router.post('/', authenticate, scopeData(), validate(createSurveySchema), async (req: Request, res: Response) => {
  try {
    const result = await createSurvey(req.body, {
      id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null,
    });
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// GET /api/surveys/:id
router.get('/:id', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await getSurvey(String(req.params.id), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// PATCH /api/surveys/:id
router.patch('/:id', authenticate, scopeData(), validate(updateSurveySchema), async (req: Request, res: Response) => {
  try {
    const result = await updateSurvey(
      String(req.params.id), req.body,
      { id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null },
      req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;

