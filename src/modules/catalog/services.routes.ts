import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { handleError } from './catalog.helpers';
import {
  listServices,
  getService,
  createService,
  updateService,
  deleteService,
} from './services.service';

const router = Router();

// GET /api/services — all authenticated users
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await listServices(req.query as Record<string, unknown>);
    return ok(res, result.data, result.meta);
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/services/:id — all authenticated users
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await getService(String(req.params.id));
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /api/services — Admin only
router.post('/', authenticate, authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await createService(req.body);
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

// PATCH /api/services/:id — Admin only
router.patch('/:id', authenticate, authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await updateService(String(req.params.id), req.body);
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

// DELETE /api/services/:id — Admin only
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await deleteService(String(req.params.id));
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
