import { z } from 'zod';
import { CustomerType, UserStatus, Role, type Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ownerFilter } from '../../lib/rbac';
import { applyListQuery, buildMeta } from '../../lib/list-query';

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */
export const createCustomerSchema = z.object({
  customerType:      z.nativeEnum(CustomerType),
  companyName:       z.string().max(200).optional().nullable(),
  contactPerson:     z.string().min(1, 'Contact person is required').max(200),
  phone:             z.string().min(1, 'Phone is required').max(30),
  email:             z.string().email().max(255).optional().nullable(),
  address:           z.string().max(500).optional().nullable(),
  billingAddress:    z.string().max(500).optional().nullable(),
  taxVatNo:          z.string().max(50).optional().nullable(),
  managerId:         z.string().uuid().optional().nullable(),
  marketingPersonId: z.string().uuid().optional().nullable(),
  status:            z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
});

export const updateCustomerSchema = createCustomerSchema.partial().strict();

/* ─── Actor context ───────────────────────────────────────────────────────── */
export interface Actor {
  id: string;
  role: Role;
  managerId?: string | null;
}

/* ─── Select shape ────────────────────────────────────────────────────────── */
const CUSTOMER_SELECT = {
  id: true, customerType: true, companyName: true, contactPerson: true,
  phone: true, email: true, address: true, billingAddress: true,
  taxVatNo: true, status: true, createdAt: true, updatedAt: true,
  convertedFromLeadId: true,
  managerId: true,
  manager:        { select: { id: true, name: true, email: true } },
  marketingPersonId: true,
  marketingPerson: { select: { id: true, name: true, email: true } },
} as const;

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function notFound(): never {
  throw Object.assign(new Error('Customer not found'), { code: 'NOT_FOUND', status: 404 });
}

function scopedWhere(
  visibleUserIds: string[] | null,
  extra: Prisma.CustomerWhereInput = {}
): Prisma.CustomerWhereInput {
  const ownership = ownerFilter('marketingPersonId', visibleUserIds);
  return { AND: [{ deletedAt: null }, ownership, extra] };
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

  // ADMIN — validate both users exist
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

/* ─── List ────────────────────────────────────────────────────────────────── */
export async function listCustomers(
  query: Record<string, unknown>,
  visibleUserIds: string[] | null
) {
  const extraWhere: Prisma.CustomerWhereInput = {};
  if (query.customerType)      extraWhere.customerType      = query.customerType as CustomerType;
  if (query.managerId)         extraWhere.managerId         = query.managerId as string;
  if (query.marketingPersonId) extraWhere.marketingPersonId = query.marketingPersonId as string;
  if (query.dateFrom || query.dateTo) {
    extraWhere.createdAt = {};
    if (query.dateFrom) (extraWhere.createdAt as Prisma.DateTimeFilter).gte = new Date(query.dateFrom as string);
    if (query.dateTo)   (extraWhere.createdAt as Prisma.DateTimeFilter).lte = new Date(query.dateTo as string);
  }

  const base = scopedWhere(visibleUserIds, extraWhere);
  const { skip, take, where, orderBy, page, limit } =
    applyListQuery<Prisma.CustomerWhereInput>(query, base, ['contactPerson', 'companyName', 'phone', 'email']);

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: orderBy as Prisma.CustomerOrderByWithRelationInput[], skip, take, select: CUSTOMER_SELECT }),
    prisma.customer.count({ where }),
  ]);

  return { data: rows, meta: buildMeta(total, page, limit) };
}

/* ─── Get one ─────────────────────────────────────────────────────────────── */
export async function getCustomer(id: string, visibleUserIds: string[] | null) {
  const cust = await prisma.customer.findFirst({
    where: { AND: [{ id }, { deletedAt: null }, ownerFilter('marketingPersonId', visibleUserIds)] },
    select: CUSTOMER_SELECT,
  });
  if (!cust) notFound();
  return cust;
}

/* ─── Create ──────────────────────────────────────────────────────────────── */
export async function createCustomer(raw: unknown, actor: Actor) {
  const input = createCustomerSchema.parse(raw);
  const { managerId, marketingPersonId } = await resolveOwnership(input, actor);

  return prisma.customer.create({
    data: {
      customerType:      input.customerType,
      companyName:       input.companyName?.trim() ?? null,
      contactPerson:     input.contactPerson.trim(),
      phone:             input.phone.trim(),
      email:             input.email?.trim() ?? null,
      address:           input.address?.trim() ?? null,
      billingAddress:    input.billingAddress?.trim() ?? null,
      taxVatNo:          input.taxVatNo?.trim() ?? null,
      managerId,
      marketingPersonId,
      status:            input.status,
    },
    select: CUSTOMER_SELECT,
  });
}

/* ─── Update ──────────────────────────────────────────────────────────────── */
export async function updateCustomer(
  id: string,
  raw: unknown,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  const existing = await prisma.customer.findFirst({
    where: { AND: [{ id }, { deletedAt: null }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!existing) notFound();

  const input = updateCustomerSchema.parse(raw);

  if (actor.role === 'MARKETING') {
    if (input.marketingPersonId && input.marketingPersonId !== actor.id) {
      throw Object.assign(new Error('You cannot reassign this customer to another person'), { code: 'FORBIDDEN', status: 403 });
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
        prisma.user
          .findFirst({ where: { id: input.marketingPersonId, deletedAt: null } })
          .then((u) => {
            if (!u) throw Object.assign(new Error('Marketing person not found'), { code: 'NOT_FOUND', status: 404 });
          })
      );
    }
    if (input.managerId) {
      checks.push(
        prisma.user
          .findFirst({ where: { id: input.managerId, deletedAt: null } })
          .then((u) => {
            if (!u) throw Object.assign(new Error('Manager not found'), { code: 'NOT_FOUND', status: 404 });
          })
      );
    }
    if (checks.length) await Promise.all(checks);
  }

  const data: Prisma.CustomerUncheckedUpdateInput = {};
  if (input.customerType      !== undefined) data.customerType      = input.customerType;
  if (input.companyName       !== undefined) data.companyName       = input.companyName?.trim() ?? null;
  if (input.contactPerson     !== undefined) data.contactPerson     = input.contactPerson.trim();
  if (input.phone             !== undefined) data.phone             = input.phone.trim();
  if (input.email             !== undefined) data.email             = input.email?.trim() ?? null;
  if (input.address           !== undefined) data.address           = input.address?.trim() ?? null;
  if (input.billingAddress    !== undefined) data.billingAddress    = input.billingAddress?.trim() ?? null;
  if (input.taxVatNo          !== undefined) data.taxVatNo          = input.taxVatNo?.trim() ?? null;
  if (input.status            !== undefined) data.status            = input.status;
  if (input.managerId         !== undefined) data.managerId         = input.managerId ?? existing.managerId;
  if (input.marketingPersonId !== undefined && input.marketingPersonId !== null) data.marketingPersonId = input.marketingPersonId;

  return prisma.customer.update({ where: { id }, data, select: CUSTOMER_SELECT });
}
