import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate, listQuerySchema } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import {
  listCategories, getCategory, createCategory, updateCategory, deleteCategory,
  createCategorySchema, updateCategorySchema,
} from './categories.service';

const router = Router();

// GET /api/categories
router.get('/', authenticate, validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const result = await listCategories((req.parsedQuery ?? req.query) as Record<string, unknown>);
    return ok(res, result.data, result.meta);
  } catch (err) { return handleError(res, err); }
});

// GET /api/categories/:id
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await getCategory(String(req.params.id));
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/categories — Admin only
router.post('/', authenticate, authorize(['ADMIN']), validate(createCategorySchema), async (req: Request, res: Response) => {
  try {
    const result = await createCategory(req.body);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// PATCH /api/categories/:id — Admin only
router.patch('/:id', authenticate, authorize(['ADMIN']), validate(updateCategorySchema), async (req: Request, res: Response) => {
  try {
    const result = await updateCategory(String(req.params.id), req.body);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// DELETE /api/categories/:id — Admin only
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await deleteCategory(String(req.params.id));
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;

