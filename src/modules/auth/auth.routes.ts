import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import {
  login,
  refreshToken,
  logout,
  me,
  ensureDemoAdmin,
  changePassword,
  loginSchema,
  changePasswordSchema,
  type LoginResult,
} from './auth.service';

const router = Router();

/* refresh body schema — defined here since it's small */
const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  try {
    await ensureDemoAdmin();
    const result = (await login(req.body)) as LoginResult;
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/auth/refresh
router.post('/refresh', validate(refreshSchema), async (req: Request, res: Response) => {
  try {
    const result = await refreshToken(req.body);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const body = req.body as { refreshToken?: string } | undefined;
    const result = await logout(req.user!.id, body?.refreshToken);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await me(req.user!.id);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/auth/change-password
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await changePassword(req.user!.id, req.body);
      return ok(res, result);
    } catch (err) { return handleError(res, err); }
  }
);

export default router;
