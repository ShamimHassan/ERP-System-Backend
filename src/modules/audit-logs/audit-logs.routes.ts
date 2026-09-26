import { Router, type Request, type Response } from 'express';
import { authenticate, authorize, scopeData } from '../../middleware/auth';
import { validate, listQuerySchema } from '../../middleware/validate';
import { handleError } from '../../lib/handle-error';
import { ok } from '../../lib/response';
import type { Role } from '@prisma/client';
import { listAuditLogs, type AuditScope } from './audit-logs.service';

const router = Router({ mergeParams: true });

function actorOf(req: Request): AuditScope['actor'] {
  const r = req as unknown as { user?: { id: string; role: Role; managerId?: string | null } };
  if (!r.user) throw Object.assign(new Error('Unauthenticated'), { code: 'UNAUTHORIZED', status: 401 });
  return { id: r.user.id, role: r.user.role, managerId: r.user.managerId, ip: req.ip ?? null };
}

// GET /api/audit-logs — Admin = all; Manager = team; Marketing = 403
router.get(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  scopeData(),
  validate(listQuerySchema, 'query'),
  async (req: Request, res: Response) => {
    try {
      const result = await listAuditLogs(
        { actor: actorOf(req), visibleUserIds: req.visibleUserIds ?? null },
        (req.parsedQuery ?? req.query) as unknown as Parameters<typeof listAuditLogs>[1]
      );
      return ok(res, result.data, result.meta);
    } catch (err) { return handleError(res, err); }
  }
);

export default router;

