import { z } from 'zod';
import {
  ActivityRelatedType, ActivityType, Role, UserStatus,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ownerFilter } from '../../lib/rbac';
import { applyListQuery, buildMeta } from '../../lib/list-query';

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */
export const createActivitySchema = z.object({
  relatedType:   z.nativeEnum(ActivityRelatedType),
  relatedId:     z.string().uuid('Invalid relatedId'),
  assignedUserId: z.string().uuid('Invalid assignedUserId').optional().nullable(),
  type:          z.nativeEnum(ActivityType),
  activityDate:  z.string().date('activityDate must be YYYY-MM-DD'),
  activityTime:  z.string().max(20).optional().nullable(),
  outcome:       z.string().max(500).optional().nullable(),
  nextFollowUp:  z.string().date().optional().nullable(),
  notes:         z.string().max(2000).optional().nullable(),
  status:        z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
});

export const updateActivitySchema = createActivitySchema.partial().strict();

/* ─── Actor context ───────────────────────────────────────────────────────── */
export interface Actor {
  id: string;
  role: Role;
  managerId?: string | null;
}

/* ─── Select shape ────────────────────────────────────────────────────────── */
const ACTIVITY_SELECT = {
  id: true, relatedType: true, relatedId: true, assignedUserId: true,
  type: true, activityDate: true, activityTime: true, outcome: true,
  nextFollowUp: true, notes: true, status: true, createdAt: true,
  assignedUser: { select: { id: true, name: true, email: true, role: true } },
} as const;

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function notFound(): never {
  throw Object.assign(new Error('Activity not found'), { code: 'NOT_FOUND', status: 404 });
}

async function validateRelatedRecord(relatedType: ActivityRelatedType, relatedId: string): Promise<void> {
  let exists: unknown = null;
  switch (relatedType) {
    case ActivityRelatedType.LEAD:
      exists = await prisma.lead.findFirst({ where: { id: relatedId, deletedAt: null } });
      break;
    case ActivityRelatedType.CUSTOMER:
      exists = await prisma.customer.findFirst({ where: { id: relatedId, deletedAt: null } });
      break;
    case ActivityRelatedType.OPPORTUNITY:
      exists = await prisma.opportunity.findFirst({ where: { id: relatedId } });
      break;
  }
  if (!exists) {
    throw Object.assign(new Error(`${relatedType} record not found`), { code: 'NOT_FOUND', status: 404 });
  }
}

/** Resolve the assignedUserId with role-scoped validation. */
async function resolveAssignedUser(
  input: { assignedUserId?: string | null },
  actor: Actor
): Promise<string> {
  // Marketing user can only assign to themselves
  if (actor.role === 'MARKETING') return actor.id;

  // Manager: default self or a team member
  if (actor.role === 'MANAGER') {
    const target = input.assignedUserId ?? actor.id;
    if (target !== actor.id) {
      const member = await prisma.user.findFirst({
        where: { id: target, managerId: actor.id, deletedAt: null },
      });
      if (!member) throw Object.assign(new Error('Assigned user must be a member of your team'), { code: 'FORBIDDEN', status: 403 });
    }
    return target;
  }

  // ADMIN: must provide or default to self
  const target = input.assignedUserId ?? actor.id;
  const u = await prisma.user.findFirst({ where: { id: target, deletedAt: null } });
  if (!u) throw Object.assign(new Error('Assigned user not found'), { code: 'NOT_FOUND', status: 404 });
  return target;
}

/** Scoped WHERE: Activities are scoped by the linked assignedUserId */
function scopedWhere(
  visibleUserIds: string[] | null,
  extra: Prisma.ActivityWhereInput = {}
): Prisma.ActivityWhereInput {
  const ownership = ownerFilter('assignedUserId', visibleUserIds);
  return { AND: [ownership, extra] };
}

/* ─── List ────────────────────────────────────────────────────────────────── */
export async function listActivities(
  query: Record<string, unknown>,
  visibleUserIds: string[] | null
) {
  const extraWhere: Prisma.ActivityWhereInput = {};
  if (query.relatedType)    extraWhere.relatedType    = query.relatedType as ActivityRelatedType;
  if (query.relatedId)      extraWhere.relatedId      = query.relatedId as string;
  if (query.assignedUserId) extraWhere.assignedUserId = query.assignedUserId as string;
  if (query.type)           extraWhere.type           = query.type as ActivityType;
  if (query.status)         extraWhere.status         = query.status as UserStatus;
  if (query.activityDateFrom || query.activityDateTo) {
    extraWhere.activityDate = {};
    if (query.activityDateFrom) (extraWhere.activityDate as Prisma.DateTimeFilter).gte = new Date(query.activityDateFrom as string);
    if (query.activityDateTo)   (extraWhere.activityDate as Prisma.DateTimeFilter).lte = new Date(query.activityDateTo as string);
  }

  const base = scopedWhere(visibleUserIds, extraWhere);
  const { skip, take, where, orderBy, page, limit } =
    applyListQuery<Prisma.ActivityWhereInput>(query, base, ['notes', 'outcome']);

  const [rows, total] = await Promise.all([
    prisma.activity.findMany({
      where, orderBy: orderBy as Prisma.ActivityOrderByWithRelationInput[],
      skip, take, select: ACTIVITY_SELECT,
    }),
    prisma.activity.count({ where }),
  ]);

  return { data: rows, meta: buildMeta(total, page, limit) };
}

/* ─── Get one ─────────────────────────────────────────────────────────────── */
export async function getActivity(id: string, visibleUserIds: string[] | null) {
  const act = await prisma.activity.findFirst({
    where: { AND: [{ id }, ownerFilter('assignedUserId', visibleUserIds)] },
    select: ACTIVITY_SELECT,
  });
  if (!act) notFound();
  return act;
}

/* ─── Create ──────────────────────────────────────────────────────────────── */
export async function createActivity(raw: unknown, actor: Actor) {
  const input = createActivitySchema.parse(raw);
  await validateRelatedRecord(input.relatedType, input.relatedId);
  const assignedUserId = await resolveAssignedUser(input, actor);

  return prisma.activity.create({
    data: {
      relatedType:   input.relatedType,
      relatedId:     input.relatedId,
      assignedUserId,
      type:          input.type,
      activityDate:  new Date(input.activityDate),
      activityTime:  input.activityTime?.trim() ?? null,
      outcome:       input.outcome?.trim() ?? null,
      nextFollowUp:  input.nextFollowUp ? new Date(input.nextFollowUp) : null,
      notes:         input.notes?.trim() ?? null,
      status:        input.status,
    },
    select: ACTIVITY_SELECT,
  });
}
