import { z } from 'zod';
import {
  QuotationStatus, SalesOrderStatus, Role, UserStatus,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ownerFilter } from '../../lib/rbac';
import { applyListQuery, buildMeta } from '../../lib/list-query';

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */
const salesOrderItemInput = z.object({
  productId: z.string().uuid('Invalid productId'),
  quantity:  z.number().int().positive('Quantity must be a positive integer'),
  unitPrice: z.number().nonnegative('Unit price cannot be negative'),
  discount:  z.number().min(0, 'Discount cannot be negative').max(100, 'Discount cannot exceed 100'),
  tax:       z.number().min(0, 'Tax cannot be negative').max(100, 'Tax cannot exceed 100'),
});

export const createSalesOrderSchema = z.object({
  quotationId:          z.string().uuid('Invalid quotationId').optional(),
  customerId:           z.string().uuid('Invalid customerId'),
  orderDate:            z.string().date('orderDate must be YYYY-MM-DD'),
  expectedActivationDate: z.string().date().optional().nullable(),
  discountTotal:        z.number().min(0, 'Header discountTotal cannot be negative').default(0),
  taxTotal:             z.number().min(0, 'Header taxTotal cannot be negative').default(0),
  paymentTerms:         z.string().max(500).optional().nullable(),
  status:               z.nativeEnum(SalesOrderStatus).default(SalesOrderStatus.CONFIRMED),
  managerId:            z.string().uuid().optional().nullable(),
  marketingPersonId:    z.string().uuid().optional().nullable(),
  items:                z.array(salesOrderItemInput).optional(),
});

export const updateSalesOrderSchema = z.object({
  orderDate:             z.string().date().optional(),
  expectedActivationDate: z.string().date().optional().nullable(),
  discountTotal:         z.number().min(0).optional(),
  taxTotal:              z.number().min(0).optional(),
  paymentTerms:          z.string().max(500).optional().nullable(),
  status:                z.nativeEnum(SalesOrderStatus).optional(),
  managerId:             z.string().uuid().optional().nullable(),
  marketingPersonId:     z.string().uuid().optional().nullable(),
}).strict();

export const addSalesOrderItemSchema = salesOrderItemInput;

/* ─── Actor context ───────────────────────────────────────────────────────── */
export interface Actor {
  id: string;
  role: Role;
  managerId?: string | null;
}

/* ─── Select shapes ───────────────────────────────────────────────────────── */
const SALES_ORDER_ITEM_SELECT = {
  id: true, productId: true, quantity: true, unitPrice: true,
  discount: true, tax: true, lineTotal: true,
  product: { select: { id: true, name: true, unit: true } },
} as const;

const SALES_ORDER_SELECT = {
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
  items: { select: SALES_ORDER_ITEM_SELECT, orderBy: { id: 'asc' as const } },
} as const;

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function notFound(msg = 'Sales Order not found'): never {
  throw Object.assign(new Error(msg), { code: 'NOT_FOUND', status: 404 });
}

function scopedWhere(
  visibleUserIds: string[] | null,
  extra: Prisma.SalesOrderWhereInput = {}
): Prisma.SalesOrderWhereInput {
  const ownership = ownerFilter('marketingPersonId', visibleUserIds);
  return { AND: [ownership, extra] };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

function visibleIdsOrNullFromActor(actor: Actor): string[] | null {
  if (actor.role === 'ADMIN') return null;
  return [actor.id];
}

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

async function generateOrderNumber(dateIso: string): Promise<string> {
  const ymd = dateIso.replace(/-/g, '');
  const prefix = `SO-${ymd}-`;
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

/* ─── List ────────────────────────────────────────────────────────────────── */
export async function listSalesOrders(
  query: Record<string, unknown>,
  visibleUserIds: string[] | null
) {
  const extraWhere: Prisma.SalesOrderWhereInput = {};
  if (query.status)            extraWhere.status            = query.status as SalesOrderStatus;
  if (query.managerId)         extraWhere.managerId         = query.managerId as string;
  if (query.marketingPersonId) extraWhere.marketingPersonId = query.marketingPersonId as string;
  if (query.customerId)        extraWhere.customerId        = query.customerId as string;
  if (query.quotationId)       extraWhere.quotationId       = query.quotationId as string;

  if (query.dateFrom || query.dateTo) {
    extraWhere.createdAt = {};
    if (query.dateFrom) (extraWhere.createdAt as Prisma.DateTimeFilter).gte = new Date(query.dateFrom as string);
    if (query.dateTo)   (extraWhere.createdAt as Prisma.DateTimeFilter).lte = new Date(query.dateTo as string);
  }

  const base = scopedWhere(visibleUserIds, extraWhere);
  const { skip, take, where, orderBy, page, limit } =
    applyListQuery<Prisma.SalesOrderWhereInput>(query, base, ['orderNumber', 'paymentTerms']);

  const [rows, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where, orderBy: orderBy as Prisma.SalesOrderOrderByWithRelationInput[],
      skip, take, select: SALES_ORDER_SELECT,
    }),
    prisma.salesOrder.count({ where }),
  ]);

  return { data: rows, meta: buildMeta(total, page, limit) };
}

/* ─── Get one ─────────────────────────────────────────────────────────────── */
export async function getSalesOrder(id: string, visibleUserIds: string[] | null) {
  const so = await prisma.salesOrder.findFirst({
    where: { AND: [{ id }, ownerFilter('marketingPersonId', visibleUserIds)] },
    select: SALES_ORDER_SELECT,
  });
  if (!so) notFound();
  return so;
}

/* ─── Create ──────────────────────────────────────────────────────────────── */
export async function createSalesOrder(raw: unknown, actor: Actor) {
  const input = createSalesOrderSchema.parse(raw);

  if (input.expectedActivationDate && new Date(input.expectedActivationDate) < new Date(input.orderDate)) {
    throw Object.assign(new Error('expectedActivationDate cannot be before orderDate'), {
      code: 'VALIDATION_ERROR', status: 400,
    });
  }

  const ownIds = visibleIdsOrNullFromActor(actor);
  const { managerId, marketingPersonId } = await resolveOwnership(input, actor);

  // ─── Validate customer + quotation ──────────────────────────────────────
  const [customer, quotation] = await Promise.all([
    prisma.customer.findFirst({
      where: { AND: [{ id: input.customerId, deletedAt: null }, ownerFilter('marketingPersonId', ownIds)] },
    }),
    input.quotationId
      ? prisma.quotation.findFirst({
          where: { AND: [{ id: input.quotationId }, ownerFilter('marketingPersonId', ownIds)] },
          select: { id: true, customerId: true, status: true,
            items: { select: { productId: true, quantity: true, unitPrice: true, discount: true, tax: true, lineTotal: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  if (!customer) throw Object.assign(new Error('Customer not found'), { code: 'NOT_FOUND', status: 404 });
  if (input.quotationId && !quotation) throw Object.assign(new Error('Quotation not found'), { code: 'NOT_FOUND', status: 404 });

  // Quotation guard rails:
  // 1) customer must match (quotation is for this customer)
  // 2) quotation status should be APPROVED or SENT (to be SO-worthy)
  // 3) prevent double-SO creation (Postgresql UNIQUE on quotationId already enforces it,
  //    but we pre-check to return 409 rather than 500)
  if (quotation) {
    if (quotation.customerId !== input.customerId) {
      throw Object.assign(new Error('Quotation is for a different customer'), {
        code: 'BAD_REQUEST', status: 400,
      });
    }
    if (!input.items) {
      // OK — snapshot items from quotation
    }
    if (quotation.status !== QuotationStatus.APPROVED && quotation.status !== QuotationStatus.SENT) {
      throw Object.assign(new Error('Quotation must be APPROVED or SENT to create a Sales Order'), {
        code: 'BAD_REQUEST', status: 400,
      });
    }
    const existingSO = await prisma.salesOrder.findFirst({
      where: { quotationId: quotation.id },
      select: { id: true },
    });
    if (existingSO) {
      throw Object.assign(new Error('A Sales Order for this quotation already exists'), {
        code: 'CONFLICT', status: 409,
      });
    }
  }

  // ─── Resolve final items (snapshot from quotation OR user-provided) ─────
  const inputItems = input.items ?? null;
  const hasExplicitItems = Array.isArray(inputItems) && inputItems.length > 0;
  const productSnapshots = hasExplicitItems
    ? inputItems.map((it) => ({ ...it, defaultPrice: null as number | null }))
    : quotation
      ? quotation.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          discount: Number(it.discount),
          tax: Number(it.tax),
          defaultPrice: null as number | null,
        }))
      : null;

  if (!productSnapshots) {
    throw Object.assign(new Error('Items are required (or link a Quotation that has items)'), {
      code: 'VALIDATION_ERROR', status: 400,
    });
  }

  // Validate products exist + optional default-price courtesy
  const validated = await Promise.all(
    productSnapshots.map(async (it) => {
      const product = await prisma.product.findFirst({
        where: { id: it.productId, status: UserStatus.ACTIVE },
      });
      if (!product) throw Object.assign(new Error(`Product ${it.productId} not found or inactive`), { code: 'NOT_FOUND', status: 404 });
      let unitPrice = it.unitPrice;
      if (unitPrice === 0 && hasExplicitItems) {
        const p = await getCurrentActivePrice(it.productId);
        if (p !== null) unitPrice = p;
      }
      return { productId: it.productId, quantity: it.quantity, unitPrice, discount: it.discount, tax: it.tax };
    })
  );

  const computedItems = computeLineTotals(validated);
  const lineTotalsSum = computedItems.reduce((s, it) => s + it.lineTotal, 0);
  const grandTotal = round2(lineTotalsSum - Number(input.discountTotal) + Number(input.taxTotal));

  const orderNumber = await generateOrderNumber(input.orderDate);

  const result = await prisma.$transaction(async (tx) => {
    const createData = {
      orderNumber,
      customerId: input.customerId,
      quotationId: input.quotationId,
      managerId,
      marketingPersonId,
      orderDate: new Date(input.orderDate),
      expectedActivationDate: input.expectedActivationDate ? new Date(input.expectedActivationDate) : null,
      discountTotal: Number(input.discountTotal),
      taxTotal: Number(input.taxTotal),
      grandTotal,
      paymentTerms: input.paymentTerms?.trim() ?? null,
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
    } as unknown as Prisma.SalesOrderCreateArgs['data'];
    const header = await tx.salesOrder.create({
      data: createData,
      select: SALES_ORDER_SELECT,
    });
    return header;
  });

  return result;
}

/* ─── Update (header only) ────────────────────────────────────────────────── */
export async function updateSalesOrder(
  id: string,
  raw: unknown,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  const existing = await prisma.salesOrder.findFirst({
    where: { AND: [{ id }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!existing) notFound();

  const input = updateSalesOrderSchema.parse(raw);

  if (actor.role === 'MARKETING') {
    if (input.marketingPersonId && input.marketingPersonId !== actor.id) {
      throw Object.assign(new Error('You cannot reassign this sales order to another person'), { code: 'FORBIDDEN', status: 403 });
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

  // Recompute grandTotal whenever discountTotal / taxTotal change
  let grandTotal: number | undefined;
  if (input.discountTotal !== undefined || input.taxTotal !== undefined) {
    const items = await prisma.salesOrderItem.findMany({
      where: { salesOrderId: id },
      select: { lineTotal: true },
    });
    const lineTotalsSum = items.reduce((s, it) => s + Number(it.lineTotal), 0);
    const newDiscount = input.discountTotal !== undefined ? Number(input.discountTotal) : Number(existing.discountTotal);
    const newTax      = input.taxTotal      !== undefined ? Number(input.taxTotal)      : Number(existing.taxTotal);
    grandTotal = round2(lineTotalsSum - newDiscount + newTax);
  }

  const data: Prisma.SalesOrderUncheckedUpdateInput = {};
  if (input.orderDate             !== undefined) data.orderDate             = new Date(input.orderDate);
  if (input.expectedActivationDate !== undefined) data.expectedActivationDate = input.expectedActivationDate ? new Date(input.expectedActivationDate) : null;
  if (input.discountTotal         !== undefined) data.discountTotal         = Number(input.discountTotal);
  if (input.taxTotal              !== undefined) data.taxTotal              = Number(input.taxTotal);
  if (input.paymentTerms          !== undefined) data.paymentTerms          = input.paymentTerms?.trim() ?? null;
  if (input.status                !== undefined) data.status                = input.status;
  if (input.managerId             !== undefined) data.managerId             = input.managerId ?? existing.managerId;
  if (input.marketingPersonId     !== undefined && input.marketingPersonId !== null) data.marketingPersonId = input.marketingPersonId;
  if (grandTotal                  !== undefined) data.grandTotal            = grandTotal;

  return prisma.salesOrder.update({ where: { id }, data, select: SALES_ORDER_SELECT });
}

/* ─── Add line item ───────────────────────────────────────────────────────── */
export async function addSalesOrderItem(
  salesOrderId: string,
  raw: unknown,
  visibleUserIds: string[] | null
) {
  const existing = await prisma.salesOrder.findFirst({
    where: { AND: [{ id: salesOrderId }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!existing) notFound();

  const input = addSalesOrderItemSchema.parse(raw);
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

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.salesOrderItem.create({
      data: {
        salesOrderId,
        productId: computed.productId,
        quantity: computed.quantity,
        unitPrice: computed.unitPrice,
        discount: computed.discount,
        tax: computed.tax,
        lineTotal: computed.lineTotal,
      },
      select: SALES_ORDER_ITEM_SELECT,
    });

    const items = await tx.salesOrderItem.findMany({
      where: { salesOrderId },
      select: { lineTotal: true },
    });
    const lineTotalsSum = items.reduce((s, it) => s + Number(it.lineTotal), 0);
    const grandTotal = round2(lineTotalsSum - Number(existing.discountTotal) + Number(existing.taxTotal));
    await tx.salesOrder.update({ where: { id: salesOrderId }, data: { grandTotal } });

    return created;
  });

  return item;
}

/* ─── Delete a line item ─────────────────────────────────────────────────── */
export async function deleteSalesOrderItem(
  salesOrderId: string,
  itemId: string,
  visibleUserIds: string[] | null
) {
  const existing = await prisma.salesOrder.findFirst({
    where: { AND: [{ id: salesOrderId }, ownerFilter('marketingPersonId', visibleUserIds)] },
  });
  if (!existing) notFound();

  const item = await prisma.salesOrderItem.findFirst({
    where: { id: itemId, salesOrderId },
  });
  if (!item) throw Object.assign(new Error('Sales Order item not found'), { code: 'NOT_FOUND', status: 404 });

  return prisma.$transaction(async (tx) => {
    await tx.salesOrderItem.delete({ where: { id: itemId } });

    const items = await tx.salesOrderItem.findMany({
      where: { salesOrderId },
      select: { lineTotal: true },
    });
    const lineTotalsSum = items.reduce((s, it) => s + Number(it.lineTotal), 0);
    const grandTotal = round2(lineTotalsSum - Number(existing.discountTotal) + Number(existing.taxTotal));
    await tx.salesOrder.update({ where: { id: salesOrderId }, data: { grandTotal } });

    return { id: itemId, deleted: true };
  });
}
