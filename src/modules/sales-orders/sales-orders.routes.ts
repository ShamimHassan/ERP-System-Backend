import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, scopeData } from '../../middleware/auth';
import { ok, fail } from '../../lib/response';
import type { Role } from '@prisma/client';
import {
  listSalesOrders, getSalesOrder, createSalesOrder, updateSalesOrder,
  addSalesOrderItem, deleteSalesOrderItem,
} from './sales-orders.service';

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
  id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId,
});

// GET /api/sales-orders
router.get('/', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await listSalesOrders(req.query as Record<string, unknown>, req.visibleUserIds ?? null);
    return ok(res, result.data, result.meta);
  } catch (err) { return handleError(res, err); }
});

// POST /api/sales-orders
router.post('/', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await createSalesOrder(req.body, actorOf(req));
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// GET /api/sales-orders/:id
router.get('/:id', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await getSalesOrder(String(req.params.id), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// PATCH /api/sales-orders/:id
router.patch('/:id', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await updateSalesOrder(
      String(req.params.id), req.body, actorOf(req), req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/sales-orders/:id/items
router.post('/:id/items', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await addSalesOrderItem(
      String(req.params.id), req.body, req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// DELETE /api/sales-orders/:id/items/:itemId
router.delete('/:id/items/:itemId', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await deleteSalesOrderItem(
      String(req.params.id), String(req.params.itemId), req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;
