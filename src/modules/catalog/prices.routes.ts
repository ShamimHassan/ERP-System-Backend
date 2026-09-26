import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { handleError } from './catalog.helpers';
import {
  listPrices,
  getCurrentPrice,
  addPrice,
  updatePrice,
  getPriceHistory,
} from './prices.service';

/**
 * These routes are mounted under /api/products/:productId
 * so req.params.productId is always available.
 *
 * Mount in app.ts with mergeParams: true or by nesting under the products router.
 */
const router = Router({ mergeParams: true });

// GET /api/products/:productId/prices — all authenticated
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await listPrices(
      String(req.params.productId),
      req.query as Record<string, unknown>
    );
    return ok(res, result.data, result.meta);
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/products/:productId/prices/current — all authenticated
router.get('/current', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await getCurrentPrice(String(req.params.productId));
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /api/products/:productId/prices — Admin only (adds a new price row)
router.post(
  '/',
  authenticate,
  authorize(['ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const result = await addPrice(
        String(req.params.productId),
        req.body,
        req.user!.id,
        req.ip ?? null
      );
      return ok(res, result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

// PATCH /api/products/:productId/prices/:priceId — Admin only
// Effectively creates a new row + history (never updates in place)
router.patch(
  '/:priceId',
  authenticate,
  authorize(['ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const result = await updatePrice(
        String(req.params.productId),
        String(req.params.priceId),
        req.body,
        req.user!.id,
        req.ip ?? null
      );
      return ok(res, result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

// GET /api/products/:productId/price-history — all authenticated
router.get(
  '/history',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const result = await getPriceHistory(
        String(req.params.productId),
        req.query as Record<string, unknown>
      );
      return ok(res, result.data, result.meta);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
