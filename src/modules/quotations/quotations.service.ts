import { z } from 'zod';
import {
  ApprovalStatus, InvoiceStatus, QuotationStatus, Role, SalesOrderStatus, UserStatus,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ownerFilter } from '../../lib/rbac';
import { applyListQuery, buildMeta } from '../../lib/list-query';
import { audit, buildFieldChanges } from '../../lib/audit';

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

export const rejectQuotationSchema = z.object({
  remarks: z.string().max(1000, 'Remarks cannot exceed 1000 characters'),
});

/* ─── Actor context ───────────────────────────────────────────────────────── */
export interface Actor {
  id: string;
  role: Role;
  managerId?: string | null;
  ip?: string | null;
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

/** Get current active price record for a product with minimumPrice */
async function getCurrentActivePriceWithMin(productId: string): Promise<{ id: string; minimumPrice: number; sellingPrice: number } | null> {
  const price = await prisma.productPrice.findFirst({
    where: {
      productId,
      status: UserStatus.ACTIVE,
      effectiveDate: { lte: new Date() },
    },
    orderBy: { effectiveDate: 'desc' },
    take: 1,
    select: { id: true, minimumPrice: true, sellingPrice: true },
  });
  return price ? { id: price.id, minimumPrice: Number(price.minimumPrice), sellingPrice: Number(price.sellingPrice) } : null;
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

/** Validate all line items meet min price OR have APPROVED PriceApproval row */
async function validateApprovalReadiness(quotationId: string): Promise<{ ok: true } | { ok: false; failedItemIds: string[] }> {
  const items = await prisma.quotationItem.findMany({
    where: { quotationId },
    include: {
      approvals: { select: { status: true } },
    },
  });

  const failed: string[] = [];
  for (const item of items) {
    const priceInfo = await getCurrentActivePriceWithMin(item.productId);
    const minPrice = priceInfo ? priceInfo.minimumPrice : Number(item.unitPrice);
    const unitPrice = Number(item.unitPrice);
    if (unitPrice >= minPrice) continue;
    const hasApproved = item.approvals.some((a) => a.status === ApprovalStatus.APPROVED);
    if (!hasApproved) failed.push(item.id);
  }

  if (failed.length) return { ok: false, failedItemIds: failed };
  return { ok: true };
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

  const finalItems = productSnapshots.map((it) => {
    let unitPrice = it.unitPrice;
    if (unitPrice === 0 && it.defaultPrice !== null) unitPrice = it.defaultPrice;
    return { productId: it.productId, quantity: it.quantity, unitPrice, discount: it.discount, tax: it.tax };
  });

  const computedItems = computeLineTotals(finalItems);
  const lineTotalsSum = computedItems.reduce((s, it) => s + it.lineTotal, 0);

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

  await audit({
    actor,
    module: 'QUOTATIONS',
    action: 'CREATE',
    entityId: result.id,
    entityLabel: result.quotationNumber,
    summary: `Created quotation ${result.quotationNumber} for customer (grandTotal=${grandTotal})`,
    details: {
      customerId: result.customerId,
      itemsCount: result.items.length,
      discountTotal: result.discountTotal,
      taxTotal: result.taxTotal,
      grandTotal: result.grandTotal,
      status: result.status,
    } as unknown as Prisma.InputJsonValue,
    relatedUserId: result.marketingPersonId,
  });

  if (Number(input.discountTotal) > 0) {
    await audit({
      actor,
      module: 'QUOTATIONS',
      action: 'DISCOUNT_CHANGE',
      entityId: result.id,
      entityLabel: result.quotationNumber,
      summary: `Quotation ${result.quotationNumber} created with discount ${input.discountTotal}`,
      details: {
        old: { discountTotal: 0, grandTotal: null },
        new: { discountTotal: input.discountTotal, grandTotal },
      } as unknown as Prisma.InputJsonValue,
      relatedUserId: result.marketingPersonId,
    });
  }

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

  if (input.status === QuotationStatus.APPROVED) {
    if (actor.role === Role.MARKETING) {
      throw Object.assign(new Error('Marketing users cannot set quotation to APPROVED'), {
        code: 'FORBIDDEN', status: 403,
      });
    }
    const readiness = await validateApprovalReadiness(id);
    if (!readiness.ok) {
      throw Object.assign(
        new Error(`Approval required for item(s): ${readiness.failedItemIds.join(', ')}`),
        { code: 'APPROVAL_REQUIRED', status: 409 }
      );
    }
  }

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

  const updated = prisma.quotation.update({ where: { id }, data, select: QUOTATION_SELECT });

  void updated.then(async (q) => {
    const changes = buildFieldChanges(
      existing as unknown as Record<string, unknown>,
      data as unknown as Record<string, unknown>
    );
    const audits: Parameters<typeof audit>[0][] = [{
      actor,
      module: 'QUOTATIONS',
      action: 'UPDATE',
      entityId: q.id,
      entityLabel: q.quotationNumber,
      summary: `Updated quotation ${q.quotationNumber} (${changes.changed.length} fields)`,
      details: changes as unknown as Prisma.InputJsonValue,
      relatedUserId: q.marketingPersonId,
    }];
    if (changes.changed.some((c) => c.field === 'status')) {
      audits.push({
        actor,
        module: 'QUOTATIONS',
        action: 'STATUS_CHANGE',
        entityId: q.id,
        entityLabel: q.quotationNumber,
        summary: `Quotation status changed: ${existing.status} → ${q.status}`,
        details: { old: { status: existing.status }, new: { status: q.status } } as unknown as Prisma.InputJsonValue,
        relatedUserId: q.marketingPersonId,
      });
      // If status was set to APPROVED or REJECTED directly via update, note in audit trail
      if (q.status === QuotationStatus.APPROVED) {
        audits.push({
          actor,
          module: 'QUOTATIONS',
          action: 'APPROVE',
          entityId: q.id,
          entityLabel: q.quotationNumber,
          summary: `Quotation ${q.quotationNumber} approved via status update`,
          details: { old: { status: existing.status }, new: { status: q.status } } as unknown as Prisma.InputJsonValue,
          relatedUserId: q.marketingPersonId,
        });
      }
      if (q.status === QuotationStatus.REJECTED) {
        audits.push({
          actor,
          module: 'QUOTATIONS',
          action: 'REJECT',
          entityId: q.id,
          entityLabel: q.quotationNumber,
          summary: `Quotation ${q.quotationNumber} rejected via status update`,
          details: { old: { status: existing.status }, new: { status: q.status } } as unknown as Prisma.InputJsonValue,
          relatedUserId: q.marketingPersonId,
        });
      }
    }
    if (changes.changed.some((c) => c.field === 'discountTotal')) {
      audits.push({
        actor,
        module: 'QUOTATIONS',
        action: 'DISCOUNT_CHANGE',
        entityId: q.id,
        entityLabel: q.quotationNumber,
        summary: `Quotation discount changed from ${existing.discountTotal} → ${q.discountTotal}`,
        details: {
          old: { discountTotal: existing.discountTotal, grandTotal: existing.grandTotal },
          new: { discountTotal: q.discountTotal,        grandTotal: q.grandTotal },
        } as unknown as Prisma.InputJsonValue,
        relatedUserId: q.marketingPersonId,
      });
    }
    if (changes.changed.some((c) => c.field === 'marketingPersonId')) {
      audits.push({
        actor,
        module: 'QUOTATIONS',
        action: existing.marketingPersonId ? 'REASSIGN' : 'ASSIGN',
        entityId: q.id,
        entityLabel: q.quotationNumber,
        summary: `Quotation re-assigned to marketing person ${q.marketingPersonId}`,
        details: {
          old: { marketingPersonId: existing.marketingPersonId },
          new: { marketingPersonId: q.marketingPersonId },
        } as unknown as Prisma.InputJsonValue,
        relatedUserId: q.marketingPersonId,
      });
    }
    await Promise.all(audits.map((a) => audit(a)));
  });
  return updated;
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

/* ─── Submit approval: create PENDING PriceApproval rows for below-min items */
export async function submitApproval(
  quotationId: string,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  const quotation = await prisma.quotation.findFirst({
    where: { AND: [{ id: quotationId }, ownerFilter('marketingPersonId', visibleUserIds)] },
    include: {
      items: true,
    },
  });
  if (!quotation) notFound();

  const created: Array<{ quotationItemId: string; requestedPrice: number; minimumPrice: number }> = [];
  const skipped: Array<{ quotationItemId: string; reason: string }> = [];

  for (const item of quotation.items) {
    const priceInfo = await getCurrentActivePriceWithMin(item.productId);
    if (!priceInfo) {
      skipped.push({ quotationItemId: item.id, reason: 'No active price found for product' });
      continue;
    }
    const unitPrice = Number(item.unitPrice);
    const minimumPrice = priceInfo.minimumPrice;
    if (unitPrice >= minimumPrice) {
      skipped.push({ quotationItemId: item.id, reason: 'unitPrice >= minimumPrice' });
      continue;
    }

    const existingApproval = await prisma.priceApproval.findFirst({
      where: { quotationItemId: item.id, status: ApprovalStatus.PENDING },
    });
    if (existingApproval) {
      skipped.push({ quotationItemId: item.id, reason: 'PENDING approval already exists' });
      continue;
    }

    await prisma.priceApproval.create({
      data: {
        quotationItemId: item.id,
        productPriceId: priceInfo.id,
        requestedPrice: unitPrice,
        minimumPrice,
        requestedById: actor.id,
        status: ApprovalStatus.PENDING,
      },
    });
    created.push({ quotationItemId: item.id, requestedPrice: unitPrice, minimumPrice });
  }

  const result = {
    quotationId,
    submitted: created.length,
    created,
    skipped,
  };

  if (created.length > 0) {
    void audit({
      actor,
      module: 'QUOTATIONS',
      action: 'PRICE_APPROVAL_SUBMIT',
      entityId: quotationId,
      entityLabel: quotation.quotationNumber,
      summary: `Submitted ${created.length} price approval requests for quotation ${quotation.quotationNumber}`,
      details: {
        submittedItems: created,
        skippedItems: skipped,
      } as unknown as Prisma.InputJsonValue,
      relatedUserId: quotation.marketingPersonId,
    });
  }

  return result;
}

/* ─── Approve: set all PENDING approvals to APPROVED + quotation status to APPROVED */
export async function approveQuotation(
  quotationId: string,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  const quotation = await prisma.quotation.findFirst({
    where: { AND: [{ id: quotationId }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!quotation) notFound();

  if (actor.role === Role.MARKETING) {
    throw Object.assign(new Error('Marketing users cannot approve quotations'), {
      code: 'FORBIDDEN', status: 403,
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const pending = await tx.priceApproval.findMany({
      where: {
        quotationItem: { quotationId },
        status: ApprovalStatus.PENDING,
      },
    });

    await tx.priceApproval.updateMany({
      where: {
        id: { in: pending.map((p) => p.id) },
      },
      data: {
        status: ApprovalStatus.APPROVED,
        approverId: actor.id,
        decidedAt: new Date(),
      },
    });

    const readiness = await validateApprovalReadiness(quotationId);
    if (!readiness.ok) {
      throw Object.assign(
        new Error(`Approval required for item(s): ${readiness.failedItemIds.join(', ')}`),
        { code: 'APPROVAL_REQUIRED', status: 409 }
      );
    }

    const updated = await tx.quotation.update({
      where: { id: quotationId },
      data: { status: QuotationStatus.APPROVED },
      select: QUOTATION_SELECT,
    });

    return {
      approved: pending.length,
      quotation: updated,
    };
  });

  void audit({
    actor,
    module: 'QUOTATIONS',
    action: 'QUOTATION_APPROVAL',
    entityId: quotationId,
    entityLabel: quotation.quotationNumber,
    summary: `Quotation ${quotation.quotationNumber} approved — ${result.approved} price approval(s) confirmed`,
    details: {
      old: { status: quotation.status, approvedPriceItems: 0 },
      new: { status: QuotationStatus.APPROVED, approvedPriceItems: result.approved },
    } as unknown as Prisma.InputJsonValue,
    relatedUserId: quotation.marketingPersonId,
  });

  void audit({
    actor,
    module: 'QUOTATIONS',
    action: 'STATUS_CHANGE',
    entityId: quotationId,
    entityLabel: quotation.quotationNumber,
    summary: `Quotation status: ${quotation.status} → APPROVED`,
    details: { old: { status: quotation.status }, new: { status: QuotationStatus.APPROVED } } as unknown as Prisma.InputJsonValue,
    relatedUserId: quotation.marketingPersonId,
  });

  return result;
}

/* ─── Reject: set PENDING approvals to REJECTED + quotation status to REJECTED with remarks */
export async function rejectQuotation(
  quotationId: string,
  raw: unknown,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  const quotation = await prisma.quotation.findFirst({
    where: { AND: [{ id: quotationId }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!quotation) notFound();

  if (actor.role === Role.MARKETING) {
    throw Object.assign(new Error('Marketing users cannot reject quotations'), {
      code: 'FORBIDDEN', status: 403,
    });
  }

  const input = rejectQuotationSchema.parse(raw);

  const result = await prisma.$transaction(async (tx) => {
    const pending = await tx.priceApproval.findMany({
      where: {
        quotationItem: { quotationId },
        status: ApprovalStatus.PENDING,
      },
    });

    await tx.priceApproval.updateMany({
      where: {
        id: { in: pending.map((p) => p.id) },
      },
      data: {
        status: ApprovalStatus.REJECTED,
        approverId: actor.id,
        decidedAt: new Date(),
        remarks: input.remarks,
      },
    });

    const updated = await tx.quotation.update({
      where: { id: quotationId },
      data: { status: QuotationStatus.REJECTED },
      select: QUOTATION_SELECT,
    });

    return {
      rejected: pending.length,
      remarks: input.remarks,
      quotation: updated,
    };
  });

  void audit({
    actor,
    module: 'QUOTATIONS',
    action: 'QUOTATION_REJECTION',
    entityId: quotationId,
    entityLabel: quotation.quotationNumber,
    summary: `Quotation ${quotation.quotationNumber} rejected — remarks: ${input.remarks}`,
    details: {
      old: { status: quotation.status },
      new: { status: QuotationStatus.REJECTED },
      remarks: input.remarks,
      rejectedPriceItems: result.rejected,
    } as unknown as Prisma.InputJsonValue,
    relatedUserId: quotation.marketingPersonId,
  });

  void audit({
    actor,
    module: 'QUOTATIONS',
    action: 'STATUS_CHANGE',
    entityId: quotationId,
    entityLabel: quotation.quotationNumber,
    summary: `Quotation status: ${quotation.status} → REJECTED`,
    details: { old: { status: quotation.status }, new: { status: QuotationStatus.REJECTED } } as unknown as Prisma.InputJsonValue,
    relatedUserId: quotation.marketingPersonId,
  });

  return result;
}

/* ─── Order/Invoice number generators (local copy to avoid cross-module import) */
async function genOrderNumber(dateIso: string): Promise<string> {
  const ymd = dateIso.replace(/-/g, '');
  const prefix = `ORD-${ymd}-`;
  const last = await prisma.salesOrder.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  let seq = 1;
  if (last) {
    const m = last.orderNumber.match(/-(\d{4})$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${seq.toString().padStart(4, '0')}`;
}
async function genInvoiceNumber(dateIso: string): Promise<string> {
  const ymd = dateIso.replace(/-/g, '');
  const prefix = `INV-${ymd}-`;
  const last = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  let seq = 1;
  if (last) {
    const m = last.invoiceNumber.match(/-(\d{4})$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${seq.toString().padStart(4, '0')}`;
}

/* ─── Convert APPROVED Quotation → Sales Order (Step 16) */
export async function convertQuotationToOrder(
  quotationId: string,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  void actor;

  const quotation = await prisma.quotation.findFirst({
    where: { AND: [{ id: quotationId }, ownerFilter('marketingPersonId', visibleUserIds)] },
    include: {
      items: {
        orderBy: { id: 'asc' as const },
        select: {
          id: true, productId: true, quantity: true, unitPrice: true,
          discount: true, tax: true, lineTotal: true,
        },
      },
    },
  });
  if (!quotation) notFound();

  if (quotation.status === QuotationStatus.CONVERTED) {
    throw Object.assign(new Error('Quotation has already been converted to a Sales Order'), {
      code: 'CONFLICT', status: 409,
    });
  }

  if (quotation.status === QuotationStatus.REJECTED) {
    throw Object.assign(new Error('Rejected quotation cannot be converted to Sales Order'), {
      code: 'BAD_REQUEST', status: 409,
    });
  }

  if (quotation.status !== QuotationStatus.APPROVED) {
    throw Object.assign(new Error('Only APPROVED quotations can be converted to Sales Orders'), {
      code: 'BAD_REQUEST', status: 400,
    });
  }

  if (!quotation.items.length) {
    throw Object.assign(new Error('Quotation has no line items'), {
      code: 'BAD_REQUEST', status: 400,
    });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const [orderNumber, invoiceNumber] = await Promise.all([
    genOrderNumber(todayIso),
    genInvoiceNumber(todayIso),
  ]);

  const result = await prisma.$transaction(async (tx) => {
    const doubleCheck = await tx.salesOrder.findFirst({
      where: { quotationId: quotation.id },
      select: { id: true },
    });
    if (doubleCheck) {
      throw Object.assign(new Error('A Sales Order for this quotation already exists'), {
        code: 'CONFLICT', status: 409,
      });
    }

    const salesOrder = await tx.salesOrder.create({
      data: {
        orderNumber,
        customerId: quotation.customerId,
        quotationId: quotation.id,
        managerId: quotation.managerId,
        marketingPersonId: quotation.marketingPersonId,
        orderDate: new Date(todayIso),
        expectedActivationDate: null,
        discountTotal: Number(quotation.discountTotal),
        taxTotal: Number(quotation.taxTotal),
        grandTotal: Number(quotation.grandTotal),
        paymentTerms: quotation.paymentTerms,
        status: SalesOrderStatus.CONFIRMED,
        items: {
          create: quotation.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            unitPrice: Number(it.unitPrice),
            discount: Number(it.discount),
            tax: Number(it.tax),
            lineTotal: Number(it.lineTotal),
          })),
        },
      },
      select: {
        id: true, orderNumber: true, orderDate: true, expectedActivationDate: true,
        discountTotal: true, taxTotal: true, grandTotal: true,
        paymentTerms: true, status: true, createdAt: true, updatedAt: true,
        customerId: true, quotationId: true,
        customer: { select: { id: true, companyName: true, contactPerson: true, phone: true, email: true } },
        quotation: { select: { id: true, quotationNumber: true, status: true } },
        managerId: true,
        manager: { select: { id: true, name: true, email: true } },
        marketingPersonId: true,
        marketingPerson: { select: { id: true, name: true, email: true } },
        items: {
          orderBy: { id: 'asc' as const },
          select: {
            id: true, productId: true, quantity: true, unitPrice: true,
            discount: true, tax: true, lineTotal: true,
            product: { select: { id: true, name: true, unit: true } },
          },
        },
      },
    });

    await tx.invoice.create({
      data: {
        salesOrderId: salesOrder.id,
        invoiceNumber,
        amount: Number(quotation.grandTotal),
        status: InvoiceStatus.ISSUED,
        issuedAt: new Date(),
      },
    });

    await tx.quotation.update({
      where: { id: quotation.id },
      data: { status: QuotationStatus.CONVERTED },
    });

    const orderWithInvoice = await tx.salesOrder.findFirst({
      where: { id: salesOrder.id },
      select: {
        id: true, orderNumber: true, orderDate: true, expectedActivationDate: true,
        discountTotal: true, taxTotal: true, grandTotal: true,
        paymentTerms: true, status: true, createdAt: true, updatedAt: true,
        customerId: true, quotationId: true,
        customer: { select: { id: true, companyName: true, contactPerson: true, phone: true, email: true } },
        quotation: { select: { id: true, quotationNumber: true, status: true } },
        managerId: true,
        manager: { select: { id: true, name: true, email: true } },
        marketingPersonId: true,
        marketingPerson: { select: { id: true, name: true, email: true } },
        items: {
          orderBy: { id: 'asc' as const },
          select: {
            id: true, productId: true, quantity: true, unitPrice: true,
            discount: true, tax: true, lineTotal: true,
            product: { select: { id: true, name: true, unit: true } },
          },
        },
        invoice: { select: { id: true, invoiceNumber: true, amount: true, status: true, issuedAt: true, paidAt: true } },
      },
    });

    return orderWithInvoice;
  });

  void audit({
    actor,
    module: 'QUOTATIONS',
    action: 'CONVERT',
    entityId: quotation.id,
    entityLabel: quotation.quotationNumber,
    summary: `Quotation ${quotation.quotationNumber} converted to Sales Order ${result?.orderNumber}`,
    details: {
      salesOrderId: result?.id,
      orderNumber: result?.orderNumber,
      grandTotal: quotation.grandTotal,
      itemsCount: quotation.items.length,
    } as unknown as Prisma.InputJsonValue,
    relatedUserId: quotation.marketingPersonId,
  });

  void audit({
    actor,
    module: 'SALES_ORDERS',
    action: 'ORDER_CREATE',
    entityId: result?.id ?? '',
    entityLabel: result?.orderNumber,
    summary: `Sales order ${result?.orderNumber} created via quotation conversion`,
    details: {
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      grandTotal: quotation.grandTotal,
    } as unknown as Prisma.InputJsonValue,
    relatedUserId: quotation.marketingPersonId,
  });

  return result;
}

