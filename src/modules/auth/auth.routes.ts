import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { fail, ok } from '../../lib/response';
import {
  login,
  refreshToken,
  logout,
  me,
  ensureDemoAdmin,
  type LoginResult,
} from './auth.service';

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

router.post('/login', async (req: Request, res: Response) => {
  try {
    await ensureDemoAdmin();
    const result = (await login(req.body)) as LoginResult;
    return ok(res, result);
  } catch (err) {
    return handleServiceError(res, err);
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const result = await refreshToken(req.body);
    return ok(res, result);
  } catch (err) {
    return handleServiceError(res, err);
  }
});

router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = req.body as { refreshToken?: string } | undefined;
    const result = await logout(userId, body?.refreshToken);
    return ok(res, result);
  } catch (err) {
    return handleServiceError(res, err);
  }
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await me(req.user!.id);
    return ok(res, result);
  } catch (err) {
    return handleServiceError(res, err);
  }
});

export default router;
