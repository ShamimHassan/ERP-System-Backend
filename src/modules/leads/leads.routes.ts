import { Router, type Request, type Response } from 'express';
import { authenticate, authorize, scopeData } from '../../middleware/auth';
import { validate, listQuerySchema } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import type { Role } from '@prisma/client';
import {
  listLeads, getLead, createLead, updateLead, deleteLead, convertLead,
  createLeadSchema, updateLeadSchema,
} from './leads.service';

const router = Router();

// GET /api/leads
router.get('/', authenticate, scopeData(), validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const result = await listLeads((req.parsedQuery ?? req.query) as Record<string, unknown>, req.visibleUserIds ?? null);
    return ok(res, result.data, result.meta);
  } catch (err) { return handleError(res, err); }
});

// POST /api/leads
router.post('/', authenticate, scopeData(), validate(createLeadSchema), async (req: Request, res: Response) => {
  try {
    const result = await createLead(req.body, {
      id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null,
    });
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// GET /api/leads/:id
router.get('/:id', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await getLead(String(req.params.id), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// PATCH /api/leads/:id
router.patch('/:id', authenticate, scopeData(), validate(updateLeadSchema), async (req: Request, res: Response) => {
  try {
    const result = await updateLead(
      String(req.params.id), req.body,
      { id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null },
      req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// DELETE /api/leads/:id
router.delete('/:id', authenticate, authorize(['ADMIN', 'MANAGER']), scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await deleteLead(
      String(req.params.id),
      { id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null },
      req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/leads/:id/convert  (no body)
router.post('/:id/convert', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await convertLead(
      String(req.params.id),
      { id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null },
      req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;

