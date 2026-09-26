import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, authorize, scopeData } from '../../middleware/auth';
import { ok, fail } from '../../lib/response';
import type { Role } from '@prisma/client';
import {
  listQuotations, getQuotation, createQuotation, updateQuotation,
  addQuotationItem, deleteQuotationItem,
  submitApproval, approveQuotation, rejectQuotation,
  convertQuotationToOrder,
} from './quotations.service';

const router = Router();

function handleError(res: Response, err: unknown): void {
  if (err instanceof z.ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    fail(res, 400, { code: 'VALIDATION_ERROR', message: 'Request validation failed', details });
    return;
  }
  const status  = err && typeof err === 'object' && 'status' in err ? Number((err as { status: unknown }).status) || 500 : 500;
  const code    = err && typeof err === 'object' && 'code'   in err ? String((err as { code:   unknown }).code)   : status === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';
  fail(res, status, { code, message });
}

const actorOf = (req: Request) => ({
  id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null,
});

// GET /api/quotations
router.get('/', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await listQuotations(req.query as Record<string, unknown>, req.visibleUserIds ?? null);
    return ok(res, result.data, result.meta);
  } catch (err) { return handleError(res, err); }
});

// POST /api/quotations
router.post('/', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await createQuotation(req.body, actorOf(req));
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// GET /api/quotations/:id
router.get('/:id', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await getQuotation(String(req.params.id), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// PATCH /api/quotations/:id
router.patch('/:id', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await updateQuotation(
      String(req.params.id), req.body, actorOf(req), req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/quotations/:id/items
router.post('/:id/items', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await addQuotationItem(
      String(req.params.id), req.body, actorOf(req), req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// DELETE /api/quotations/:id/items/:itemId
router.delete('/:id/items/:itemId', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await deleteQuotationItem(
      String(req.params.id), String(req.params.itemId), req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/quotations/:id/submit-approval
router.post('/:id/submit-approval', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await submitApproval(
      String(req.params.id), actorOf(req), req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/quotations/:id/approve  (Manager/Admin only)
router.post('/:id/approve', authenticate, scopeData(), authorize(['MANAGER', 'ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await approveQuotation(
      String(req.params.id), actorOf(req), req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/quotations/:id/reject   (Manager/Admin only)
router.post('/:id/reject', authenticate, scopeData(), authorize(['MANAGER', 'ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await rejectQuotation(
      String(req.params.id), req.body, actorOf(req), req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/quotations/:id/convert-to-order
router.post('/:id/convert-to-order', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await convertQuotationToOrder(
      String(req.params.id), actorOf(req), req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;
