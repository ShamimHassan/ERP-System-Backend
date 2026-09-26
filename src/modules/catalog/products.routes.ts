import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { handleError } from './catalog.helpers';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from './products.service';

const router = Router();

// GET /api/products?categoryId=&serviceId= — all authenticated
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await listProducts(req.query as Record<string, unknown>);
    return ok(res, result.data, result.meta);
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/products/:id — all authenticated
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await getProduct(String(req.params.id));
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /api/products — Admin only
router.post('/', authenticate, authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await createProduct(req.body, req.user!.id);
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

// PATCH /api/products/:id — Admin only
router.patch('/:id', authenticate, authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await updateProduct(String(req.params.id), req.body, req.user!.id);
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

// DELETE /api/products/:id — Admin only
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await deleteProduct(String(req.params.id), req.user!.id);
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
