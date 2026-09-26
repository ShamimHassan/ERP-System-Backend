import { z } from 'zod';
import {
  OpportunityStage, Role, UserStatus,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ownerFilter } from '../../lib/rbac';
import { applyListQuery, buildMeta } from '../../lib/list-query';

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */
export const createOpportunitySchema = z.object({
  name:                z.string().min(1, 'Opportunity name is required').max(200),
  leadId:              z.string().uuid().optional().nullable(),
  customerId:          z.string().uuid().optional().nullable(),
  serviceId:           z.string().uuid().optional().nullable(),
  categoryId:          z.string().uuid().optional().nullable(),
  productId:           z.string().uuid().optional().nullable(),
  estimatedValue:      z.number().positive().optional().nullable(),
  expectedClosingDate: z.string().date().optional().nullable(),
  managerId:           z.string().uuid().optional().nullable(),
  marketingPersonId:   z.string().uuid().optional().nullable(),
  stage:               z.nativeEnum(OpportunityStage).default(OpportunityStage.QUALIFICATION),
  notes:               z.string().max(2000).optional().nullable(),
});

export const updateOpportunitySchema = createOpportunitySchema.partial().strict();

/* ─── Actor context ───────────────────────────────────────────────────────── */
export interface Actor {
  id: string;
  role: Role;
  managerId?: string | null;
}

/* ─── Select shape ────────────────────────────────────────────────────────── */
const OPPORTUNITY_SELECT = {
  id: true, name: true, estimatedValue: true, expectedClosingDate: true,
  stage: true, notes: true, createdAt: true, updatedAt: true,
  leadId: true, customerId: true, serviceId: true, categoryId: true, productId: true,
  lead:     { select: { id: true, leadName: true, companyName: true } },
  customer: { select: { id: true, companyName: true, contactPerson: true } },
  service:  { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  product:  { select: { id: true, name: true } },
  managerId: true,
  manager:         { select: { id: true, name: true, email: true } },
  marketingPersonId: true,
  marketingPerson: { select: { id: true, name: true, email: true } },
} as const;

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function notFound(): never {
  throw Object.assign(new Error('Opportunity not found'), { code: 'NOT_FOUND', status: 404 });
}

function scopedWhere(
  visibleUserIds: string[] | null,
  extra: Prisma.OpportunityWhereInput = {}
): Prisma.OpportunityWhereInput {
  const ownership = ownerFilter('marketingPersonId', visibleUserIds);
  return { AND: [ownership, extra] };
}

async function resolveOwnership(
  input: { managerId?: string | null; marketingPersonId?: string | null },
  actor: Actor
): Promise<{ managerId: string; marketingPersonId: string }> {
  if (actor.role === 'MARKETING') {
    const self = await prisma.user.findUnique({ where: { id: actor.id }, select: { managerId: true } });
    if (!self?.managerId) {
      throw Object.assign(new Error('Marketing user has no assigned manager'), { code: 'BAD_REQUEST', status: 400 });
    }
    return { marketingPersonId: actor.id, managerId: self.managerId };
  }

  if (actor.role === 'MANAGER') {
    const marketingPersonId = input.marketingPersonId ?? actor.id;
    if (marketingPersonId !== actor.id) {
      const member = await prisma.user.findFirst({
        where: { id: marketingPersonId, managerId: actor.id, deletedAt: null },
      });
      if (!member) throw Object.assign(new Error('Marketing person must be a member of your team'), { code: 'FORBIDDEN', status: 403 });
    }
    return { marketingPersonId, managerId: actor.id };
  }

  // ADMIN
  if (!input.marketingPersonId) throw Object.assign(new Error('marketingPersonId is required'), { code: 'VALIDATION_ERROR', status: 400 });
  if (!input.managerId)         throw Object.assign(new Error('managerId is required'), { code: 'VALIDATION_ERROR', status: 400 });
  const [mktUser, mgrUser] = await Promise.all([
    prisma.user.findFirst({ where: { id: input.marketingPersonId, deletedAt: null } }),
    prisma.user.findFirst({ where: { id: input.managerId, deletedAt: null } }),
  ]);
  if (!mktUser) throw Object.assign(new Error('Marketing person not found'), { code: 'NOT_FOUND', status: 404 });
  if (!mgrUser) throw Object.assign(new Error('Manager not found'), { code: 'NOT_FOUND', status: 404 });
  return { marketingPersonId: input.marketingPersonId, managerId: input.managerId };
}

async function validateRelatedIds(
  ids: {
    leadId?: string | null; customerId?: string | null;
    serviceId?: string | null; categoryId?: string | null; productId?: string | null;
  }
): Promise<void> {
  const checks: Promise<unknown>[] = [];
  if (ids.leadId) {
    checks.push(
      prisma.lead.findFirst({ where: { id: ids.leadId, deletedAt: null } }).then((l) => {
        if (!l) throw Object.assign(new Error('Lead not found'), { code: 'NOT_FOUND', status: 404 });
      })
    );
  }
  if (ids.customerId) {
    checks.push(
      prisma.customer.findFirst({ where: { id: ids.customerId, deletedAt: null } }).then((c) => {
        if (!c) throw Object.assign(new Error('Customer not found'), { code: 'NOT_FOUND', status: 404 });
      })
    );
  }
  if (ids.serviceId) {
    checks.push(
      prisma.service.findFirst({ where: { id: ids.serviceId, status: UserStatus.ACTIVE } }).then((s) => {
        if (!s) throw Object.assign(new Error('Service not found or inactive'), { code: 'NOT_FOUND', status: 404 });
      })
    );
  }
  if (ids.categoryId) {
    checks.push(
      prisma.productCategory.findFirst({ where: { id: ids.categoryId, status: UserStatus.ACTIVE } }).then((c) => {
        if (!c) throw Object.assign(new Error('Category not found or inactive'), { code: 'NOT_FOUND', status: 404 });
      })
    );
  }
  if (ids.productId) {
    checks.push(
      prisma.product.findFirst({ where: { id: ids.productId, status: UserStatus.ACTIVE } }).then((p) => {
        if (!p) throw Object.assign(new Error('Product not found or inactive'), { code: 'NOT_FOUND', status: 404 });
      })
    );
  }
  if (checks.length) await Promise.all(checks);
}

/* ─── List ────────────────────────────────────────────────────────────────── */
export async function listOpportunities(
  query: Record<string, unknown>,
  visibleUserIds: string[] | null
) {
  const extraWhere: Prisma.OpportunityWhereInput = {};
  if (query.stage)             extraWhere.stage             = query.stage as OpportunityStage;
  if (query.managerId)         extraWhere.managerId         = query.managerId as string;
  if (query.marketingPersonId) extraWhere.marketingPersonId = query.marketingPersonId as string;
  if (query.leadId)            extraWhere.leadId            = query.leadId as string;
  if (query.customerId)        extraWhere.customerId        = query.customerId as string;
  if (query.serviceId)         extraWhere.serviceId         = query.serviceId as string;

  if (query.dateFrom || query.dateTo) {
    extraWhere.createdAt = {};
    if (query.dateFrom) (extraWhere.createdAt as Prisma.DateTimeFilter).gte = new Date(query.dateFrom as string);
    if (query.dateTo)   (extraWhere.createdAt as Prisma.DateTimeFilter).lte = new Date(query.dateTo as string);
  }

  const base = scopedWhere(visibleUserIds, extraWhere);
  const { skip, take, where, orderBy, page, limit } =
    applyListQuery<Prisma.OpportunityWhereInput>(query, base, ['name', 'notes']);

  const [rows, total] = await Promise.all([
    prisma.opportunity.findMany({
      where, orderBy: orderBy as Prisma.OpportunityOrderByWithRelationInput[],
      skip, take, select: OPPORTUNITY_SELECT,
    }),
    prisma.opportunity.count({ where }),
  ]);

  return { data: rows, meta: buildMeta(total, page, limit) };
}

/* ─── Get one ─────────────────────────────────────────────────────────────── */
export async function getOpportunity(id: string, visibleUserIds: string[] | null) {
  const opp = await prisma.opportunity.findFirst({
    where: { AND: [{ id }, ownerFilter('marketingPersonId', visibleUserIds)] },
    select: OPPORTUNITY_SELECT,
  });
  if (!opp) notFound();
  return opp;
}

/* ─── Create ──────────────────────────────────────────────────────────────── */
export async function createOpportunity(raw: unknown, actor: Actor) {
  const input = createOpportunitySchema.parse(raw);
  const { managerId, marketingPersonId } = await resolveOwnership(input, actor);
  await validateRelatedIds({
    leadId: input.leadId, customerId: input.customerId,
    serviceId: input.serviceId, categoryId: input.categoryId, productId: input.productId,
  });

  return prisma.opportunity.create({
    data: {
      name:                input.name.trim(),
      leadId:              input.leadId ?? null,
      customerId:          input.customerId ?? null,
      serviceId:           input.serviceId ?? null,
      categoryId:          input.categoryId ?? null,
      productId:           input.productId ?? null,
      estimatedValue:      input.estimatedValue ?? null,
      expectedClosingDate: input.expectedClosingDate ? new Date(input.expectedClosingDate) : null,
      managerId,
      marketingPersonId,
      stage:               input.stage,
      notes:               input.notes?.trim() ?? null,
    },
    select: OPPORTUNITY_SELECT,
  });
}

/* ─── Update ──────────────────────────────────────────────────────────────── */
export async function updateOpportunity(
  id: string,
  raw: unknown,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  const existing = await prisma.opportunity.findFirst({
    where: { AND: [{ id }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!existing) notFound();

  const input = updateOpportunitySchema.parse(raw);
  await validateRelatedIds({
    leadId: input.leadId, customerId: input.customerId,
    serviceId: input.serviceId, categoryId: input.categoryId, productId: input.productId,
  });

  if (actor.role === 'MARKETING') {
    if (input.marketingPersonId && input.marketingPersonId !== actor.id) {
      throw Object.assign(new Error('You cannot reassign this opportunity to another person'), { code: 'FORBIDDEN', status: 403 });
    }
    delete (input as Record<string, unknown>).managerId;
  }

  if (actor.role === 'MANAGER') {
    if (input.marketingPersonId && input.marketingPersonId !== existing.marketingPersonId) {
      const member = await prisma.user.findFirst({
        where: { id: input.marketingPersonId, managerId: actor.id, deletedAt: null },
      });
      if (!member) throw Object.assign(new Error('Marketing person must be a member of your team'), { code: 'FORBIDDEN', status: 403 });
    }
  }

  if (actor.role === 'ADMIN') {
    const checks: Promise<unknown>[] = [];
    if (input.marketingPersonId) {
      checks.push(
        prisma.user.findFirst({ where: { id: input.marketingPersonId, deletedAt: null } }).then((u) => {
          if (!u) throw Object.assign(new Error('Marketing person not found'), { code: 'NOT_FOUND', status: 404 });
        })
      );
    }
    if (input.managerId) {
      checks.push(
        prisma.user.findFirst({ where: { id: input.managerId, deletedAt: null } }).then((u) => {
          if (!u) throw Object.assign(new Error('Manager not found'), { code: 'NOT_FOUND', status: 404 });
        })
      );
    }
    if (checks.length) await Promise.all(checks);
  }

  const data: Prisma.OpportunityUncheckedUpdateInput = {};
  if (input.name                !== undefined) data.name                = input.name.trim();
  if (input.leadId              !== undefined) data.leadId              = input.leadId ?? null;
  if (input.customerId          !== undefined) data.customerId          = input.customerId ?? null;
  if (input.serviceId           !== undefined) data.serviceId           = input.serviceId ?? null;
  if (input.categoryId          !== undefined) data.categoryId          = input.categoryId ?? null;
  if (input.productId           !== undefined) data.productId           = input.productId ?? null;
  if (input.estimatedValue      !== undefined) data.estimatedValue      = input.estimatedValue ?? null;
  if (input.expectedClosingDate !== undefined) data.expectedClosingDate = input.expectedClosingDate ? new Date(input.expectedClosingDate) : null;
  if (input.stage               !== undefined) data.stage               = input.stage;
  if (input.notes               !== undefined) data.notes               = input.notes?.trim() ?? null;
  if (input.managerId           !== undefined) data.managerId           = input.managerId ?? existing.managerId;
  if (input.marketingPersonId   !== undefined && input.marketingPersonId !== null) data.marketingPersonId = input.marketingPersonId;

  return prisma.opportunity.update({ where: { id }, data, select: OPPORTUNITY_SELECT });
}
