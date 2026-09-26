import { AuditAction, AuditModule, Role, type Prisma } from '@prisma/client';
import { prisma } from './prisma';

export interface AuditActor {
  id: string;
  role: Role;
  managerId?: string | null;
  /** Client IP forwarded from req.ip at the route layer */
  ip?: string | null;
}

export type AuditModuleName = AuditModule;
export type AuditActionName = AuditAction;

export interface WriteAuditOptions {
  actor: AuditActor;
  module: AuditModuleName;
  action: AuditActionName;
  entityId?: string | null;
  entityLabel?: string | null;
  /** Short human-readable summary of what happened */
  summary?: string | null;
  /** machine-readable structured data: old/new/fields/details */
  details?: Prisma.InputJsonValue;
  /** if the record has a marketingPerson / assignedPerson id, track for scoping */
  relatedUserId?: string | null;
  /** Client IP, captured from req.ip at the route layer ("where available") */
  ipAddress?: string | null;
}

/* ─── Main audit writer ─────────────────────────────────────────────────── */
export async function audit(opts: WriteAuditOptions): Promise<void> {
  try {
    const {
      actor, module, action,
      entityId = null,
      entityLabel = null,
      summary = null,
      details = null,
      relatedUserId = null,
      ipAddress = null,
    } = opts;

    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        module,
        action,
        entityId,
        entityLabel,
        summary,
        details: details ?? undefined,
        relatedUserId,
        // actor.ip (set at route layer) takes precedence over explicit ipAddress param
        ipAddress: actor.ip ?? ipAddress,
      },
    });
  } catch (err) {
    // Never let audit logging break the business path — fire & forget
    // eslint-disable-next-line no-console
    console.error('[AUDIT FAIL]', err);
  }
}

/* ─── Helper factory: bulk writes with fire-and-forget pattern ──────────── */
export function multiAudit(items: WriteAuditOptions[]): Promise<void[]> {
  return Promise.all(items.map((i) => audit(i)));
}

/* ─── Scoping helpers for audit-logs listing ───────────────────────────── */
export interface ListAuditQuery {
  userId?: string;
  actorId?: string;
  module?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: string | number;
  limit?: string | number;
  sort?: string;
}

export interface AuditActorScope {
  actor: AuditActor;
  /** list of team-member IDs the actor can see; null = all (admin) */
  visibleUserIds: string[] | null;
}

/** Resolve the scoped WHERE filter for GET /api/audit-logs */
export async function resolveAuditWhereScope(
  scope: AuditActorScope,
  query: ListAuditQuery
): Promise<{ where: Prisma.AuditLogWhereInput; totalScope: Prisma.AuditLogWhereInput }> {
  const { actor, visibleUserIds } = scope;

  // Marketing users are NEVER allowed to see audit logs
  if (actor.role === Role.MARKETING) {
    throw Object.assign(new Error('Marketing users cannot access audit logs'), {
      code: 'FORBIDDEN', status: 403,
    });
  }

  const where: Prisma.AuditLogWhereInput = {};
  const totalScope: Prisma.AuditLogWhereInput = {};

  if (actor.role === Role.MANAGER && visibleUserIds !== null) {
    // Manager: see entries where actorId is in the visible team OR relatedUserId is in team
    const teamIds = visibleUserIds;
    where.OR = [
      { actorId: { in: teamIds } },
      { relatedUserId: { in: teamIds } },
    ];
    totalScope.OR = where.OR;
  }
  // Admin: no scoping (null visibleUserIds means all)

  // ── Filters (AND with scope) ──────────────────────────────────────
  if (query.userId) {
    where.relatedUserId = query.userId;
  }
  if (query.actorId) {
    where.actorId = query.actorId;
  }
  if (query.module) {
    where.module = query.module as AuditModule;
  }
  if (query.action) {
    where.action = query.action as AuditAction;
  }
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(query.dateFrom);
    if (query.dateTo)   (where.createdAt as Prisma.DateTimeFilter).lte = new Date(query.dateTo);
  }

  return { where, totalScope };
}

/* ─── Small helper: build field diff details object for UPDATE audits ──── */
export function buildFieldChanges(
  oldRec: Record<string, unknown>,
  newData: Record<string, unknown>
): {
  old: Record<string, unknown>;
  new: Record<string, unknown>;
  changed: Array<{ field: string; old: unknown; new: unknown }>;
} {
  const changed: Array<{ field: string; old: unknown; new: unknown }> = [];
  const oldSnap: Record<string, unknown> = {};
  const newSnap: Record<string, unknown> = {};

  for (const key of Object.keys(newData)) {
    if (key === 'updatedAt') continue;
    const newV = newData[key];
    if (!(key in oldRec)) continue;
    const oldV = oldRec[key];
    const oldJS = oldV instanceof Date ? oldV.toISOString() : JSON.stringify(oldV);
    const newJS = newV instanceof Date ? newV.toISOString() : JSON.stringify(newV);
    if (oldJS !== newJS) {
      changed.push({ field: key, old: oldV, new: newV });
      oldSnap[key] = oldV;
      newSnap[key] = newV;
    }
  }
  return { old: oldSnap, new: newSnap, changed };
}

/* ─── Build a simple { old, new } diff for single-field changes ─────────── */
export function buildValueChange<T>(
  field: string,
  oldValue: T,
  newValue: T,
  extra?: Record<string, unknown>
): { old: Record<string, T>; new: Record<string, T> } & Record<string, unknown> {
  return { old: { [field]: oldValue }, new: { [field]: newValue }, ...extra };
}
