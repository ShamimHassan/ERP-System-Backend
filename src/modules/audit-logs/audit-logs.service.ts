import type { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { applyListQuery, buildMeta } from '../../lib/list-query';
import {
  resolveAuditWhereScope,
  type AuditActor,
  type ListAuditQuery,
} from '../../lib/audit';

const AUDIT_SELECT = {
  id: true,
  actorId: true,
  actorRole: true,
  module: true,
  action: true,
  entityId: true,
  entityLabel: true,
  summary: true,
  details: true,
  relatedUserId: true,
  createdAt: true,
  actor: {
    select: { id: true, name: true, email: true, role: true },
  },
  relatedUser: {
    select: { id: true, name: true, email: true, role: true },
  },
} as const;

export interface AuditScope {
  actor: AuditActor;
  visibleUserIds: string[] | null;
}

/** GET /api/audit-logs — scoped listing with filters & pagination */
export async function listAuditLogs(scope: AuditScope, query: ListAuditQuery) {
  // Marketing = 403, Admin = full, Manager = team only (enforced inside)
  const { where } = await resolveAuditWhereScope(scope, query);

  const { skip, take, orderBy, page, limit } =
    applyListQuery(query as unknown as Record<string, unknown>, where, []);

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy, skip, take, select: AUDIT_SELECT }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: rows.map((r) => ({
      id: r.id,
      actor: r.actor ? {
        id: r.actor.id, name: r.actor.name, email: r.actor.email, role: r.actor.role as Role,
      } : { id: r.actorId, role: r.actorRole },
      module: r.module,
      action: r.action,
      entityId: r.entityId,
      entityLabel: r.entityLabel,
      summary: r.summary,
      details: r.details,
      relatedUser: r.relatedUser ? {
        id: r.relatedUser.id, name: r.relatedUser.name, email: r.relatedUser.email, role: r.relatedUser.role as Role,
      } : r.relatedUserId ? { id: r.relatedUserId } : null,
      createdAt: r.createdAt,
    })),
    meta: buildMeta(total, page, limit),
  };
}
