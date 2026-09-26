import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, authorize, scopeData } from '../../middleware/auth';
import { ok, fail } from '../../lib/response';
import type { Role } from '@prisma/client';
import {
  listLeads, getLead, createLead, updateLead, deleteLead, convertLead,
} from './leads.service';

const router = Router();

function handleError(res: Response, err: unknown): void {
  if (err instanceof z.ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    fail(res, 400, { code: 'VALIDATION_ERROR', message: 'Request validation failed', details });
    return;
  }
  const status = err && typeof err === 'object' && 'status' in err ? Number((err as { status: unknown }).status) || 500 : 500;
  const code   = err && typeof err === 'object' && 'code'   in err ? String((err as { code:   unknown }).code)   : status === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';
  fail(res, status, { code, message });
}

// GET /api/leads
router.get('/', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await listLeads(req.query as Record<string, unknown>, req.visibleUserIds ?? null);
    return ok(res, result.data, result.meta);
  } catch (err) { return handleError(res, err); }
});

// POST /api/leads
router.post('/', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await createLead(req.body, { id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null });
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
router.patch('/:id', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await updateLead(
      String(req.params.id), req.body,
      { id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null },
      req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// DELETE /api/leads/:id — Admin + Manager only (enforced in service)
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

// POST /api/leads/:id/convert
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

