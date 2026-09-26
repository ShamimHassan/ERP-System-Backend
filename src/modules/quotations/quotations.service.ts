import { z } from 'zod';
import {
  QuotationStatus, Role, UserStatus,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ownerFilter } from '../../lib/rbac';
import { applyListQuery, buildMeta } from '../../lib/list-query';

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */
const quotationItemInput = z.object({
  productId: z.string().uuid('Invalid productId'),
  quantity:  z.number().int().positive('Quantity must be a positive integer'),
  unitPrice: z.number().nonnegative('Unit price cannot be negative'),
  discount:  z.number().min(0, 'Discount cannot be negative').max(100, 'Discount cannot exceed 100'),
  tax:       z.number().min(0, 'Tax cannot be negative').max(100, 'Tax cannot exceed 100'),
});

export const createQuotationSchema = z.object({
  customerId:     z.string().uuid('Invalid customerId'),
  opportunityId:  z.string().uuid().optional().nullable(),
  quotationDate:  z.string().date('quotationDate must be YYYY-MM-DD'),
  expiryDate:     z.string().date('expiryDate must be YYYY-MM-DD'),
  discountTotal:  z.number().min(0, 'Header discountTotal cannot be negative').default(0),
  taxTotal:       z.number().min(0, 'Header taxTotal cannot be negative').default(0),
  paymentTerms:   z.string().max(500).optional().nullable(),
  notes:          z.string().max(2000).optional().nullable(),
  managerId:      z.string().uuid().optional().nullable(),
  marketingPersonId: z.string().uuid().optional().nullable(),
  status:         z.nativeEnum(QuotationStatus).default(QuotationStatus.DRAFT),
  items:          z.array(quotationItemInput).min(1, 'At least one line item is required'),
});

export const updateQuotationSchema = z.object({
  opportunityId:  z.string().uuid().optional().nullable(),
  quotationDate:  z.string().date().optional(),
  expiryDate:     z.string().date().optional(),
  discountTotal:  z.number().min(0).optional(),
  taxTotal:       z.number().min(0).optional(),
  paymentTerms:   z.string().max(500).optional().nullable(),
  notes:          z.string().max(2000).optional().nullable(),
  managerId:      z.string().uuid().optional().nullable(),
  marketingPersonId: z.string().uuid().optional().nullable(),
  status:         z.nativeEnum(QuotationStatus).optional(),
}).strict();

export const addQuotationItemSchema = quotationItemInput;

/* ─── Actor context ───────────────────────────────────────────────────────── */
export interface Actor {
  id: string;
  role: Role;
  managerId?: string | null;
}

/* ─── Select shapes ───────────────────────────────────────────────────────── */
const QUOTATION_ITEM_SELECT = {
  id: true, productId: true, quantity: true, unitPrice: true,
  discount: true, tax: true, lineTotal: true,
  product: { select: { id: true, name: true, unit: true } },
} as const;

const QUOTATION_SELECT = {
  id: true, quotationNumber: true, quotationDate: true, expiryDate: true,
  discountTotal: true, taxTotal: true, grandTotal: true,
  paymentTerms: true, notes: true, status: true, createdAt: true, updatedAt: true,
  customerId: true, opportunityId: true,
  customer: { select: { id: true, companyName: true, contactPerson: true, phone: true, email: true } },
  opportunity: { select: { id: true, name: true, stage: true } },
  managerId: true,
  manager: { select: { id: true, name: true, email: true } },
  marketingPersonId: true,
  marketingPerson: { select: { id: true, name: true, email: true } },
  items: { select: QUOTATION_ITEM_SELECT, orderBy: { id: 'asc' as const } },
} as const;

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function notFound(msg = 'Quotation not found'): never {
  throw Object.assign(new Error(msg), { code: 'NOT_FOUND', status: 404 });
}

function scopedWhere(
  visibleUserIds: string[] | null,
  extra: Prisma.QuotationWhereInput = {}
): Prisma.QuotationWhereInput {
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

/** Round helpers for 2-decimal currency */
function round2(n: number): number { return Math.round(n * 100) / 100; }

/** Get current active product price (snapshot default) for a product */
async function getCurrentActivePrice(productId: string): Promise<number | null> {
  const price = await prisma.productPrice.findFirst({
    where: {
      productId,
      status: UserStatus.ACTIVE,
      effectiveDate: { lte: new Date() },
    },
    orderBy: { effectiveDate: 'desc' },
    take: 1,
    select: { sellingPrice: true },
  });
  return price ? Number(price.sellingPrice) : null;
}

/**
 * ⚠️ NEVER trust client totals — recalculate lineTotal for every item
 * and recompute grandTotal = Σ lineTotals - discountTotal + taxTotal_adjusted
 *
 * lineTotal per item = qty * unitPrice * (1 - discount/100) * (1 + tax/100)
 */
function computeLineTotals(
  items: Array<{ productId: string; quantity: number; unitPrice: number; discount: number; tax: number }>
): Array<{ productId: string; quantity: number; unitPrice: number; discount: number; tax: number; lineTotal: number }> {
  return items.map((it) => {
    const base = it.quantity * it.unitPrice;
    const afterDiscount = base * (1 - it.discount / 100);
    const afterTax = afterDiscount * (1 + it.tax / 100);
    return { ...it, lineTotal: round2(afterTax) };
  });
}

/** Auto-generate quotation number: QUO-YYYYMMDD-0001 */
async function generateQuotationNumber(dateIso: string): Promise<string> {
  const ymd = dateIso.replace(/-/g, '');
  const prefix = `QUO-${ymd}-`;
  const last = await prisma.quotation.findFirst({
    where: { quotationNumber: { startsWith: prefix } },
    orderBy: { quotationNumber: 'desc' },
    select: { quotationNumber: true },
  });
  let seq = 1;
  if (last) {
    const m = last.quotationNumber.match(/-(\d{4})$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${seq.toString().padStart(4, '0')}`;
}

/* ─── List ────────────────────────────────────────────────────────────────── */
export async function listQuotations(
  query: Record<string, unknown>,
  visibleUserIds: string[] | null
) {
  const extraWhere: Prisma.QuotationWhereInput = {};
  if (query.status)            extraWhere.status            = query.status as QuotationStatus;
  if (query.managerId)         extraWhere.managerId         = query.managerId as string;
  if (query.marketingPersonId) extraWhere.marketingPersonId = query.marketingPersonId as string;
  if (query.customerId)        extraWhere.customerId        = query.customerId as string;
  if (query.opportunityId)     extraWhere.opportunityId     = query.opportunityId as string;

  if (query.dateFrom || query.dateTo) {
    extraWhere.createdAt = {};
    if (query.dateFrom) (extraWhere.createdAt as Prisma.DateTimeFilter).gte = new Date(query.dateFrom as string);
    if (query.dateTo)   (extraWhere.createdAt as Prisma.DateTimeFilter).lte = new Date(query.dateTo as string);
  }

  const base = scopedWhere(visibleUserIds, extraWhere);
  const { skip, take, where, orderBy, page, limit } =
    applyListQuery<Prisma.QuotationWhereInput>(query, base, ['quotationNumber', 'notes']);

  const [rows, total] = await Promise.all([
    prisma.quotation.findMany({
      where, orderBy: orderBy as Prisma.QuotationOrderByWithRelationInput[],
      skip, take, select: QUOTATION_SELECT,
    }),
    prisma.quotation.count({ where }),
  ]);

  return { data: rows, meta: buildMeta(total, page, limit) };
}

/* ─── Get one ─────────────────────────────────────────────────────────────── */
export async function getQuotation(id: string, visibleUserIds: string[] | null) {
  const q = await prisma.quotation.findFirst({
    where: { AND: [{ id }, ownerFilter('marketingPersonId', visibleUserIds)] },
    select: QUOTATION_SELECT,
  });
  if (!q) notFound();
  return q;
}

/* ─── Create (header + items in one transaction) ──────────────────────────── */
export async function createQuotation(raw: unknown, actor: Actor) {
  const input = createQuotationSchema.parse(raw);

  if (new Date(input.expiryDate) < new Date(input.quotationDate)) {
    throw Object.assign(new Error('expiryDate cannot be before quotationDate'), {
      code: 'VALIDATION_ERROR', status: 400,
    });
  }

  const { managerId, marketingPersonId } = await resolveOwnership(input, actor);

  // Validate customer (scoped) and opportunity (scoped) existence
  const [customer, opportunity, productSnapshots] = await Promise.all([
    prisma.customer.findFirst({
      where: { AND: [{ id: input.customerId, deletedAt: null }, ownerFilter('marketingPersonId', visibleIdsOrNullFromActor(actor))] },
    }) as unknown as Promise<unknown>,
    input.opportunityId
      ? prisma.opportunity.findFirst({
          where: { AND: [{ id: input.opportunityId }, ownerFilter('marketingPersonId', visibleIdsOrNullFromActor(actor))] },
        }) as unknown as Promise<unknown>
      : Promise.resolve(null),
    Promise.all(
      input.items.map(async (it) => {
        const product = await prisma.product.findFirst({
          where: { id: it.productId, status: UserStatus.ACTIVE },
        });
        if (!product) throw Object.assign(new Error(`Product ${it.productId} not found or inactive`), { code: 'NOT_FOUND', status: 404 });
        const defaultPrice = await getCurrentActivePrice(it.productId);
        return { ...it, product, defaultPrice };
      })
    ),
  ]);

  if (!customer) throw Object.assign(new Error('Customer not found'), { code: 'NOT_FOUND', status: 404 });
  if (input.opportunityId && !opportunity) throw Object.assign(new Error('Opportunity not found'), { code: 'NOT_FOUND', status: 404 });

  // Build final items: honor client-supplied unitPrice (snapshot override allowed for negotiation)
  // but default to current active product price if the backend-default-zero is sent (optional)
  // Policy per spec: "allow override (sales negotiation). Save the value sent"
  const finalItems = productSnapshots.map((it) => {
    let unitPrice = it.unitPrice;
    // If client passes 0 but we have a default, substitute as a courtesy — unless explicitly 0 intended
    if (unitPrice === 0 && it.defaultPrice !== null) unitPrice = it.defaultPrice;
    return { productId: it.productId, quantity: it.quantity, unitPrice, discount: it.discount, tax: it.tax };
  });

  const computedItems = computeLineTotals(finalItems);
  const lineTotalsSum = computedItems.reduce((s, it) => s + it.lineTotal, 0);

  // grandTotal = Σ lineTotals − header discountTotal + header taxTotal
  // discountTotal & taxTotal are treated as absolute adjustments
  const grandTotal = round2(lineTotalsSum - Number(input.discountTotal) + Number(input.taxTotal));

  const quotationNumber = await generateQuotationNumber(input.quotationDate);

  const result = await prisma.$transaction(async (tx) => {
    const header = await tx.quotation.create({
      data: {
        quotationNumber,
        customerId: input.customerId,
        opportunityId: input.opportunityId ?? null,
        managerId,
        marketingPersonId,
        quotationDate: new Date(input.quotationDate),
        expiryDate: new Date(input.expiryDate),
        discountTotal: Number(input.discountTotal),
        taxTotal: Number(input.taxTotal),
        grandTotal,
        paymentTerms: input.paymentTerms?.trim() ?? null,
        notes: input.notes?.trim() ?? null,
        status: input.status,
        items: {
          create: computedItems.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: it.discount,
            tax: it.tax,
            lineTotal: it.lineTotal,
          })),
        },
      },
      select: QUOTATION_SELECT,
    });
    return header;
  });

  return result;
}

/* ─── Helper: quick visible-ids fallback for pre-create validation checks */
function visibleIdsOrNullFromActor(actor: Actor): string[] | null {
  if (actor.role === 'ADMIN') return null;
  return [actor.id];
}

/* ─── Update (header only — items edited via dedicated routes) ────────────── */
export async function updateQuotation(
  id: string,
  raw: unknown,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  const existing = await prisma.quotation.findFirst({
    where: { AND: [{ id }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!existing) notFound();

  const input = updateQuotationSchema.parse(raw);

  if (actor.role === 'MARKETING') {
    if (input.marketingPersonId && input.marketingPersonId !== actor.id) {
      throw Object.assign(new Error('You cannot reassign this quotation to another person'), { code: 'FORBIDDEN', status: 403 });
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

  // Recompute grandTotal whenever discountTotal or taxTotal change
  let grandTotal: number | undefined;
  if (input.discountTotal !== undefined || input.taxTotal !== undefined) {
    const [items] = await Promise.all([
      prisma.quotationItem.findMany({
        where: { quotationId: id },
        select: { lineTotal: true },
      }),
    ]);
    const lineTotalsSum = items.reduce((s, it) => s + Number(it.lineTotal), 0);
    const newDiscount = input.discountTotal !== undefined ? Number(input.discountTotal) : Number(existing.discountTotal);
    const newTax      = input.taxTotal      !== undefined ? Number(input.taxTotal)      : Number(existing.taxTotal);
    grandTotal = round2(lineTotalsSum - newDiscount + newTax);
  }

  const data: Prisma.QuotationUncheckedUpdateInput = {};
  if (input.opportunityId     !== undefined) data.opportunityId     = input.opportunityId ?? null;
  if (input.quotationDate     !== undefined) data.quotationDate     = new Date(input.quotationDate);
  if (input.expiryDate        !== undefined) data.expiryDate        = new Date(input.expiryDate);
  if (input.discountTotal     !== undefined) data.discountTotal     = Number(input.discountTotal);
  if (input.taxTotal          !== undefined) data.taxTotal          = Number(input.taxTotal);
  if (input.paymentTerms      !== undefined) data.paymentTerms      = input.paymentTerms?.trim() ?? null;
  if (input.notes             !== undefined) data.notes             = input.notes?.trim() ?? null;
  if (input.status            !== undefined) data.status            = input.status;
  if (input.managerId         !== undefined) data.managerId         = input.managerId ?? existing.managerId;
  if (input.marketingPersonId !== undefined && input.marketingPersonId !== null) data.marketingPersonId = input.marketingPersonId;
  if (grandTotal              !== undefined) data.grandTotal        = grandTotal;

  return prisma.quotation.update({ where: { id }, data, select: QUOTATION_SELECT });
}

/* ─── Add line item to existing quotation ────────────────────────────────── */
export async function addQuotationItem(
  quotationId: string,
  raw: unknown,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  const existing = await prisma.quotation.findFirst({
    where: { AND: [{ id: quotationId }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!existing) notFound();

  const input = addQuotationItemSchema.parse(raw);
  const product = await prisma.product.findFirst({
    where: { id: input.productId, status: UserStatus.ACTIVE },
  });
  if (!product) throw Object.assign(new Error('Product not found or inactive'), { code: 'NOT_FOUND', status: 404 });

  let unitPrice = input.unitPrice;
  if (unitPrice === 0) {
    const defaultPrice = await getCurrentActivePrice(input.productId);
    if (defaultPrice !== null) unitPrice = defaultPrice;
  }
  const [computed] = computeLineTotals([{ ...input, unitPrice }]);

  // Mark actor as unused to satisfy linter pattern (ownership check already done above via findFirst)
  void actor;

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.quotationItem.create({
      data: {
        quotationId,
        productId: computed.productId,
        quantity: computed.quantity,
        unitPrice: computed.unitPrice,
        discount: computed.discount,
        tax: computed.tax,
        lineTotal: computed.lineTotal,
      },
      select: QUOTATION_ITEM_SELECT,
    });

    // Recompute header totals
    const items = await tx.quotationItem.findMany({
      where: { quotationId },
      select: { lineTotal: true },
    });
    const lineTotalsSum = items.reduce((s, it) => s + Number(it.lineTotal), 0);
    const grandTotal = round2(lineTotalsSum - Number(existing.discountTotal) + Number(existing.taxTotal));
    await tx.quotation.update({ where: { id: quotationId }, data: { grandTotal } });

    return created;
  });

  return item;
}

/* ─── Delete a line item ─────────────────────────────────────────────────── */
export async function deleteQuotationItem(
  quotationId: string,
  itemId: string,
  visibleUserIds: string[] | null
) {
  const existing = await prisma.quotation.findFirst({
    where: { AND: [{ id: quotationId }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!existing) notFound();

  const item = await prisma.quotationItem.findFirst({
    where: { id: itemId, quotationId },
  });
  if (!item) throw Object.assign(new Error('Quotation item not found'), { code: 'NOT_FOUND', status: 404 });

  const result = await prisma.$transaction(async (tx) => {
    await tx.quotationItem.delete({ where: { id: itemId } });

    const items = await tx.quotationItem.findMany({
      where: { quotationId },
      select: { lineTotal: true },
    });
    const lineTotalsSum = items.reduce((s, it) => s + Number(it.lineTotal), 0);
    const grandTotal = round2(lineTotalsSum - Number(existing.discountTotal) + Number(existing.taxTotal));
    await tx.quotation.update({ where: { id: quotationId }, data: { grandTotal } });

    return { id: itemId, deleted: true };
  });

  return result;
}
