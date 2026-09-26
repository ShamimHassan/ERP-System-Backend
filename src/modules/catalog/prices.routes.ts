import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate, listQuerySchema } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import {
  listPrices, getCurrentPrice, addPrice, updatePrice, getPriceHistory,
  createPriceSchema,
} from './prices.service';

/**
 * Mounted under /api/products/:productId (mergeParams: true)
 */
const router = Router({ mergeParams: true });

// GET /api/products/:productId/prices
router.get('/', authenticate, validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const result = await listPrices(String(req.params.productId), (req.parsedQuery ?? req.query) as Record<string, unknown>);
    return ok(res, result.data, result.meta);
  } catch (err) { return handleError(res, err); }
});

// GET /api/products/:productId/prices/current
router.get('/current', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await getCurrentPrice(String(req.params.productId));
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// GET /api/products/:productId/prices/history
router.get('/history', authenticate, validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const result = await getPriceHistory(String(req.params.productId), (req.parsedQuery ?? req.query) as Record<string, unknown>);
    return ok(res, result.data, result.meta);
  } catch (err) { return handleError(res, err); }
});

// POST /api/products/:productId/prices — Admin only
router.post('/', authenticate, authorize(['ADMIN']), validate(createPriceSchema), async (req: Request, res: Response) => {
  try {
    const result = await addPrice(String(req.params.productId), req.body, req.user!.id, req.ip ?? null);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// PATCH /api/products/:productId/prices/:priceId — Admin only
router.patch('/:priceId', authenticate, authorize(['ADMIN']), validate(createPriceSchema), async (req: Request, res: Response) => {
  try {
    const result = await updatePrice(
      String(req.params.productId), String(req.params.priceId),
      req.body, req.user!.id, req.ip ?? null
    );
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;

