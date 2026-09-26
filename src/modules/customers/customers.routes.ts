import { Router, type Request, type Response } from 'express';
import { authenticate, scopeData } from '../../middleware/auth';
import { validate, listQuerySchema } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import type { Role } from '@prisma/client';
import {
  listCustomers, getCustomer, createCustomer, updateCustomer,
  createCustomerSchema, updateCustomerSchema,
} from './customers.service';

const router = Router();

// GET /api/customers
router.get('/', authenticate, scopeData(), validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const result = await listCustomers(req.query as Record<string, unknown>, req.visibleUserIds ?? null);
    return ok(res, result.data, result.meta);
  } catch (err) { return handleError(res, err); }
});

// POST /api/customers
router.post('/', authenticate, scopeData(), validate(createCustomerSchema), async (req: Request, res: Response) => {
  try {
    const result = await createCustomer(req.body, {
      id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null,
    });
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// GET /api/customers/:id
router.get('/:id', authenticate, scopeData(), async (req: Request, res: Response) => {
  try {
    const result = await getCustomer(String(req.params.id), req.visibleUserIds ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// PATCH /api/customers/:id
router.patch('/:id', authenticate, scopeData(), validate(updateCustomerSchema), async (req: Request, res: Response) => {
  try {
    const result = await updateCustomer(
      String(req.params.id), req.body,
      { id: req.user!.id, role: req.user!.role as Role, managerId: req.user!.managerId, ip: req.ip ?? null },
      req.visibleUserIds ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;
