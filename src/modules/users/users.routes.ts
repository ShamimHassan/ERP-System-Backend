import { Router, type Request, type Response } from 'express';
import { authenticate, authorize, scopeData } from '../../middleware/auth';
import { validate, listQuerySchema } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import type { Role } from '@prisma/client';
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
  createUserSchema,
  updateUserSchema,
} from './users.service';

const router = Router();

// GET /api/users
router.get(
  '/',
  authenticate,
  scopeData(),
  validate(listQuerySchema, 'query'),
  async (req: Request, res: Response) => {
    try {
      const q = (req.parsedQuery ?? req.query) as Record<string, unknown>;
      const result = await listUsers({
        page:    q.page as string | undefined,
        limit:   q.limit as string | undefined,
        sort:    q.sort as string | undefined,
        search:  q.search as string | undefined,
        status:  q.status as string | undefined,
        dateFrom: q.dateFrom as string | undefined,
        dateTo:   q.dateTo as string | undefined,
        visibleUserIds: req.visibleUserIds ?? null,
      });
      return ok(res, result.data, result.meta);
    } catch (err) { return handleError(res, err); }
  }
);

// POST /api/users
router.post(
  '/',
  authenticate,
  authorize(['ADMIN']),
  validate(createUserSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await createUser(req.body, {
        id: req.user!.id, role: req.user!.role as Role, ip: req.ip ?? null,
      });
      return ok(res, result);
    } catch (err) { return handleError(res, err); }
  }
);

// GET /api/users/:id
router.get(
  '/:id',
  authenticate,
  scopeData(),
  async (req: Request, res: Response) => {
    try {
      const result = await getUser(String(req.params.id), req.visibleUserIds ?? null);
      return ok(res, result);
    } catch (err) { return handleError(res, err); }
  }
);

// PATCH /api/users/:id
router.patch(
  '/:id',
  authenticate,
  scopeData(),
  validate(updateUserSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await updateUser(
        String(req.params.id), req.body,
        { id: req.user!.id, role: req.user!.role as Role, ip: req.ip ?? null },
        req.visibleUserIds ?? null
      );
      return ok(res, result);
    } catch (err) { return handleError(res, err); }
  }
);

// DELETE /api/users/:id
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN']),
  scopeData(),
  async (req: Request, res: Response) => {
    try {
      const result = await deleteUser(
        String(req.params.id),
        { id: req.user!.id, role: req.user!.role as Role, ip: req.ip ?? null },
        req.visibleUserIds ?? null
      );
      return ok(res, result);
    } catch (err) { return handleError(res, err); }
  }
);

export default router;

