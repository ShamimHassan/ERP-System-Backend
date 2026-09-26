import { Router, type Request, type Response } from 'express';
import { authenticate, scopeData } from '../../middleware/auth';
import { validate, listQuerySchema } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import type { Role } from '@prisma/client';
import {
  listSalesOrders, getSalesOrder, createSalesOrder, updateSalesOrder,
  addSalesOrderItem, deleteSalesOrderItem, cancelSalesOrder,
  createSalesOrderSchema, updateSalesOrderSchema, addSalesOrderItemSchema,
} from './sales-orders.service';

const router = Router();

const actorOf = (req: Request) => ({
  id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null,
});

// GET /api/sales-orders
router.get('/', authenticate, scopeData(), validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const result = await listSalesOrders((req.parsedQuery ?? req.query) as Record<string, unknown>, req.visibleUserIds ?? null);
    return ok(res, result.data, result.meta);
  } catch (err) { return handleError(res, err); }
});

// POST /api/sales-orders
router.post('/', authenticate, scopeData(), validate(createSalesOrderSchema), async (req: Request, res: Response) => {
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
router.patch('/:id', authenticate, scopeData(), validate(updateSalesOrderSchema), async (req: Request, res: Response) => {
  try {
    const result = await updateSalesOrder(String(req.params.id), req.body, actorOf(req), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/sales-orders/:id/items
router.post('/:id/items', authenticate, scopeData(), validate(addSalesOrderItemSchema), async (req: Request, res: Response) => {
  try {
    const result = await addSalesOrderItem(String(req.params.id), req.body, req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// DELETE /api/sales-orders/:id/items/:itemId
router.delete('/:id/items/:itemId', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await deleteSalesOrderItem(String(req.params.id), String(req.params.itemId), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/sales-orders/:id/cancel  (no body)
router.post('/:id/cancel', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await cancelSalesOrder(String(req.params.id), actorOf(req), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;

