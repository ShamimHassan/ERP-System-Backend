import { z } from 'zod';
import {
  LeadSource, LeadStatus, Priority, UserStatus, Role,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ownerFilter } from '../../lib/rbac';
import { applyListQuery, buildMeta } from '../../lib/list-query';

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */
export const createLeadSchema = z.object({
  leadName:          z.string().min(1, 'Lead name is required').max(200),
  companyName:       z.string().min(1, 'Company name is required').max(200),
  phone:             z.string().min(1, 'Phone is required').max(30),
  email:             z.string().email().max(255).optional().nullable(),
  address:           z.string().max(500).optional().nullable(),
  leadSource:        z.nativeEnum(LeadSource),
  serviceId:         z.string().uuid().optional().nullable(),
  categoryId:        z.string().uuid().optional().nullable(),
  productId:         z.string().uuid().optional().nullable(),
  estimatedValue:    z.number().positive().optional().nullable(),
  managerId:         z.string().uuid().optional().nullable(),
  marketingPersonId: z.string().uuid().optional().nullable(),
  priority:          z.nativeEnum(Priority),
  status:            z.nativeEnum(LeadStatus).default(LeadStatus.NEW),
  nextFollowUp:      z.string().date().optional().nullable(),
  notes:             z.string().max(2000).optional().nullable(),
});

export const updateLeadSchema = createLeadSchema.partial().strict();

/* ─── Actor context ───────────────────────────────────────────────────────── */
export interface Actor {
  id: string;
  role: Role;
  managerId?: string | null;
}

/* ─── Select shape ────────────────────────────────────────────────────────── */
const LEAD_SELECT = {
  id: true, leadName: true, companyName: true, phone: true, email: true,
  address: true, leadSource: true, estimatedValue: true,
  priority: true, status: true, nextFollowUp: true, notes: true,
  createdAt: true, updatedAt: true,
  serviceId: true, categoryId: true, productId: true,
  service:  { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  product:  { select: { id: true, name: true } },
  managerId: true,
  manager:        { select: { id: true, name: true, email: true } },
  marketingPersonId: true,
  marketingPerson: { select: { id: true, name: true, email: true } },
} as const;

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function notFound(): never {
  throw Object.assign(new Error('Lead not found'), { code: 'NOT_FOUND', status: 404 });
}

/** Build the scoped WHERE for leads: scope on marketingPersonId */
function scopedWhere(
  visibleUserIds: string[] | null,
  extra: Prisma.LeadWhereInput = {}
): Prisma.LeadWhereInput {
  const ownership = ownerFilter('marketingPersonId', visibleUserIds);
  return { AND: [{ deletedAt: null }, ownership, extra] };
}

/**
 * Resolve & enforce managerId / marketingPersonId based on actor role.
 * Returns the validated pair.
 */
async function resolveOwnership(
  input: { managerId?: string | null; marketingPersonId?: string | null },
  actor: Actor
): Promise<{ managerId: string; marketingPersonId: string }> {
  if (actor.role === 'MARKETING') {
    // Force own id; derive manager from profile
    const self = await prisma.user.findUnique({ where: { id: actor.id }, select: { managerId: true } });
    if (!self?.managerId) {
      throw Object.assign(
        new Error('Marketing user has no assigned manager. Contact an admin.'),
        { code: 'BAD_REQUEST', status: 400 }
      );
    }
    return { marketingPersonId: actor.id, managerId: self.managerId };
  }

  if (actor.role === 'MANAGER') {
    const marketingPersonId = input.marketingPersonId ?? actor.id;
    // If assigning to a team member, verify they're on this manager's team
    if (marketingPersonId !== actor.id) {
      const member = await prisma.user.findFirst({
        where: { id: marketingPersonId, managerId: actor.id, deletedAt: null },
      });
      if (!member) {
        throw Object.assign(
          new Error('Marketing person must be a member of your team'),
          { code: 'FORBIDDEN', status: 403 }
        );
      }
    }
    return { marketingPersonId, managerId: actor.id };
  }

  // ADMIN — must supply both explicitly
  if (!input.marketingPersonId) {
    throw Object.assign(
      new Error('marketingPersonId is required'),
      { code: 'VALIDATION_ERROR', status: 400 }
    );
  }
  if (!input.managerId) {
    throw Object.assign(
      new Error('managerId is required'),
      { code: 'VALIDATION_ERROR', status: 400 }
    );
  }
  // Validate both exist
  const [mktUser, mgrUser] = await Promise.all([
    prisma.user.findFirst({ where: { id: input.marketingPersonId, deletedAt: null } }),
    prisma.user.findFirst({ where: { id: input.managerId, deletedAt: null } }),
  ]);
  if (!mktUser) throw Object.assign(new Error('Marketing person not found'), { code: 'NOT_FOUND', status: 404 });
  if (!mgrUser) throw Object.assign(new Error('Manager not found'), { code: 'NOT_FOUND', status: 404 });
  return { marketingPersonId: input.marketingPersonId, managerId: input.managerId };
}

/* ─── List ────────────────────────────────────────────────────────────────── */
export async function listLeads(
  query: Record<string, unknown>,
  visibleUserIds: string[] | null
) {
  const extraWhere: Prisma.LeadWhereInput = {};
  if (query.status)            extraWhere.status = query.status as LeadStatus;
  if (query.managerId)         extraWhere.managerId = query.managerId as string;
  if (query.marketingPersonId) extraWhere.marketingPersonId = query.marketingPersonId as string;
  if (query.serviceId)         extraWhere.serviceId = query.serviceId as string;
  if (query.priority)          extraWhere.priority = query.priority as Priority;

  // date range on createdAt
  if (query.dateFrom || query.dateTo) {
    extraWhere.createdAt = {};
    if (query.dateFrom) (extraWhere.createdAt as Prisma.DateTimeFilter).gte = new Date(query.dateFrom as string);
    if (query.dateTo)   (extraWhere.createdAt as Prisma.DateTimeFilter).lte = new Date(query.dateTo as string);
  }

  const base = scopedWhere(visibleUserIds, extraWhere);

  const { skip, take, where, page, limit } =
    applyListQuery<Prisma.LeadWhereInput>(
      query,
      base,
      ['leadName', 'companyName', 'phone', 'email']
    );

  const sortField = String(query.sort ?? '-createdAt').replace(/^-/, '');
  const sortDir: Prisma.SortOrder = String(query.sort ?? '').startsWith('-') || !query.sort ? 'desc' : 'asc';
  const orderBy: Prisma.LeadOrderByWithRelationInput = { [sortField]: sortDir };

  const [rows, total] = await Promise.all([
    prisma.lead.findMany({ where, orderBy, skip, take, select: LEAD_SELECT }),
    prisma.lead.count({ where }),
  ]);

  return { data: rows, meta: buildMeta(total, page, limit) };
}

/* ─── Get one ─────────────────────────────────────────────────────────────── */
export async function getLead(id: string, visibleUserIds: string[] | null) {
  const lead = await prisma.lead.findFirst({
    where: { AND: [{ id }, { deletedAt: null }, ownerFilter('marketingPersonId', visibleUserIds)] },
    select: LEAD_SELECT,
  });
  if (!lead) notFound();
  return lead;
}

/* ─── Create ──────────────────────────────────────────────────────────────── */
export async function createLead(raw: unknown, actor: Actor) {
  const input = createLeadSchema.parse(raw);
  const { managerId, marketingPersonId } = await resolveOwnership(input, actor);

  return prisma.lead.create({
    data: {
      leadName:          input.leadName.trim(),
      companyName:       input.companyName.trim(),
      phone:             input.phone.trim(),
      email:             input.email?.trim() ?? null,
      address:           input.address?.trim() ?? null,
      leadSource:        input.leadSource,
      serviceId:         input.serviceId ?? null,
      categoryId:        input.categoryId ?? null,
      productId:         input.productId ?? null,
      estimatedValue:    input.estimatedValue ?? null,
      managerId,
      marketingPersonId,
      priority:          input.priority,
      status:            input.status,
      nextFollowUp:      input.nextFollowUp ? new Date(input.nextFollowUp) : null,
      notes:             input.notes?.trim() ?? null,
    },
    select: LEAD_SELECT,
  });
}

/* ─── Update ──────────────────────────────────────────────────────────────── */
export async function updateLead(
  id: string,
  raw: unknown,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  const existing = await prisma.lead.findFirst({
    where: { AND: [{ id }, { deletedAt: null }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!existing) notFound();

  const input = updateLeadSchema.parse(raw);

  // Prevent marketing user from re-assigning to someone else
  if (actor.role === 'MARKETING') {
    if (input.marketingPersonId && input.marketingPersonId !== actor.id) {
      throw Object.assign(
        new Error('You cannot reassign a lead to another marketing person'),
        { code: 'FORBIDDEN', status: 403 }
      );
    }
    // Silently ignore any attempt to change managerId
    delete (input as Record<string, unknown>).managerId;
  }

  if (actor.role === 'MANAGER') {
    if (input.marketingPersonId && input.marketingPersonId !== existing.marketingPersonId) {
      // Allow reassigning within own team only
      const member = await prisma.user.findFirst({
        where: { id: input.marketingPersonId, managerId: actor.id, deletedAt: null },
      });
      if (!member) {
        throw Object.assign(
          new Error('Marketing person must be a member of your team'),
          { code: 'FORBIDDEN', status: 403 }
        );
      }
    }
  }

  const data: Prisma.LeadUncheckedUpdateInput = {};
  if (input.leadName         !== undefined) data.leadName         = input.leadName.trim();
  if (input.companyName      !== undefined) data.companyName      = input.companyName.trim();
  if (input.phone            !== undefined) data.phone            = input.phone.trim();
  if (input.email            !== undefined) data.email            = input.email?.trim() ?? null;
  if (input.address          !== undefined) data.address          = input.address?.trim() ?? null;
  if (input.leadSource       !== undefined) data.leadSource       = input.leadSource;
  if (input.serviceId        !== undefined) data.serviceId        = input.serviceId ?? null;
  if (input.categoryId       !== undefined) data.categoryId       = input.categoryId ?? null;
  if (input.productId        !== undefined) data.productId        = input.productId ?? null;
  if (input.estimatedValue   !== undefined) data.estimatedValue   = input.estimatedValue ?? null;
  if (input.priority         !== undefined) data.priority         = input.priority;
  if (input.status           !== undefined) data.status           = input.status;
  if (input.nextFollowUp     !== undefined) data.nextFollowUp     = input.nextFollowUp ? new Date(input.nextFollowUp) : null;
  if (input.notes            !== undefined) data.notes            = input.notes?.trim() ?? null;
  if (input.managerId        !== undefined) data.managerId        = input.managerId ?? existing.managerId;
  if (input.marketingPersonId !== undefined && input.marketingPersonId !== null) data.marketingPersonId = input.marketingPersonId;

  return prisma.lead.update({ where: { id }, data, select: LEAD_SELECT });
}

/* ─── Soft delete ─────────────────────────────────────────────────────────── */
export async function deleteLead(
  id: string,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  if (actor.role === 'MARKETING') {
    throw Object.assign(new Error('Marketing users cannot delete leads'), { code: 'FORBIDDEN', status: 403 });
  }
  const existing = await prisma.lead.findFirst({
    where: { AND: [{ id }, { deletedAt: null }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!existing) notFound();

  await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id, deleted: true };
}

/* ─── Convert to Customer ─────────────────────────────────────────────────── */
export async function convertLead(
  id: string,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  const lead = await prisma.lead.findFirst({
    where: { AND: [{ id }, { deletedAt: null }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!lead) notFound();

  // Already converted?
  const alreadyConverted = await prisma.customer.findUnique({
    where: { convertedFromLeadId: id },
  });
  if (alreadyConverted) {
    throw Object.assign(
      new Error('This lead has already been converted to a customer'),
      { code: 'CONFLICT', status: 409 }
    );
  }

  const customer = await prisma.$transaction(async (tx) => {
    const cust = await tx.customer.create({
      data: {
        customerType:       'BUSINESS',
        companyName:        lead.companyName,
        contactPerson:      lead.leadName,
        phone:              lead.phone,
        email:              lead.email ?? null,
        address:            lead.address ?? null,
        managerId:          lead.managerId,
        marketingPersonId:  lead.marketingPersonId,
        status:             UserStatus.ACTIVE,
        convertedFromLeadId: lead.id,
      },
    });

    // Update lead status to QUALIFIED if not already beyond
    const progressedStatuses: LeadStatus[] = [
      LeadStatus.QUALIFIED, LeadStatus.PROPOSAL,
      LeadStatus.NEGOTIATION, LeadStatus.WON,
    ];
    if (!progressedStatuses.includes(lead.status)) {
      await tx.lead.update({
        where: { id: lead.id },
        data: { status: LeadStatus.QUALIFIED },
      });
    }

    return cust;
  });

  return { customerId: customer.id, leadId: id, leadStatus: LeadStatus.QUALIFIED };
}
