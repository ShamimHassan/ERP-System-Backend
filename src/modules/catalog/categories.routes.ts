import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { handleError } from './catalog.helpers';
import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from './categories.service';

const router = Router();

// GET /api/categories?serviceId= — all authenticated
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await listCategories(req.query as Record<string, unknown>);
    return ok(res, result.data, result.meta);
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/categories/:id — all authenticated
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await getCategory(String(req.params.id));
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /api/categories — Admin only
router.post('/', authenticate, authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await createCategory(req.body);
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

// PATCH /api/categories/:id — Admin only
router.patch('/:id', authenticate, authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await updateCategory(String(req.params.id), req.body);
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

// DELETE /api/categories/:id — Admin only
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await deleteCategory(String(req.params.id));
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
