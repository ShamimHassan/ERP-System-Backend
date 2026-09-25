import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, authorize, scopeData } from '../../middleware/auth';
import { ok, fail } from '../../lib/response';
import type { Role } from '@prisma/client';
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
} from './users.service';

const router = Router();

function handleZodError(res: Response, err: unknown) {
  if (err instanceof z.ZodError) {
    const details = err.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return fail(res, 400, {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details,
    });
  }
  return null;
}

function handleServiceError(res: Response, err: unknown) {
  if (handleZodError(res, err)) return;
  const status =
    err && typeof err === 'object' && 'status' in err
      ? Number((err as { status: unknown }).status) || 500
      : 500;
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : status === 500
      ? 'INTERNAL_SERVER_ERROR'
      : 'BAD_REQUEST';
  const message =
    err instanceof Error
      ? err.message
      : status === 500
      ? 'An unexpected error occurred'
      : 'Bad request';
  fail(res, status, { code, message });
}

router.get(
  '/',
  authenticate,
  scopeData(),
  async (req: Request, res: Response) => {
    try {
      const result = await listUsers({
        page: req.query.page as string | number | undefined,
        limit: req.query.limit as string | number | undefined,
        sort: req.query.sort as string | undefined,
        search: req.query.search as string | undefined,
        status: req.query.status as string | undefined,
        visibleUserIds: req.visibleUserIds ?? null,
      });
      return ok(res, result.data, result.meta);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.post(
  '/',
  authenticate,
  authorize(['ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const result = await createUser(req.body, {
        id: req.user!.id,
        role: req.user!.role as Role,
      });
      return ok(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.get(
  '/:id',
  authenticate,
  scopeData(),
  async (req: Request, res: Response) => {
    try {
      const result = await getUser(
        String(req.params.id),
        req.visibleUserIds ?? null
      );
      return ok(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.patch(
  '/:id',
  authenticate,
  scopeData(),
  async (req: Request, res: Response) => {
    try {
      const result = await updateUser(
        String(req.params.id),
        req.body,
        { id: req.user!.id, role: req.user!.role as Role },
        req.visibleUserIds ?? null
      );
      return ok(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN']),
  scopeData(),
  async (req: Request, res: Response) => {
    try {
      const result = await deleteUser(
        String(req.params.id),
        { id: req.user!.id, role: req.user!.role as Role },
        req.visibleUserIds ?? null
      );
      return ok(res, result);
    } catch (err) {
      return handleServiceError(res, err);
    }
  }
);

export default router;
