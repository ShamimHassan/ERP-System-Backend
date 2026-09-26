import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate, listQuerySchema } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import {
  listServices, getService, createService, updateService, deleteService,
  createServiceSchema, updateServiceSchema,
} from './services.service';

const router = Router();

// GET /api/services
router.get('/', authenticate, validate(listQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const result = await listServices(req.query as Record<string, unknown>);
    return ok(res, result.data, result.meta);
  } catch (err) { return handleError(res, err); }
});

// GET /api/services/:id
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await getService(String(req.params.id));
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// POST /api/services — Admin only
router.post('/', authenticate, authorize(['ADMIN']), validate(createServiceSchema), async (req: Request, res: Response) => {
  try {
    const result = await createService(req.body);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// PATCH /api/services/:id — Admin only
router.patch('/:id', authenticate, authorize(['ADMIN']), validate(updateServiceSchema), async (req: Request, res: Response) => {
  try {
    const result = await updateService(String(req.params.id), req.body);
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

// DELETE /api/services/:id — Admin only
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await deleteService(String(req.params.id));
    return ok(res, result);
  } catch (err) { return handleError(res, err); }
});

export default router;
