import { z } from 'zod';
import { BillingType, UserStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { applyListQuery, buildMeta } from '../../lib/list-query';
import { audit } from '../../lib/audit';

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */
export const createPriceSchema = z.object({
  regularPrice:  z.number().positive('Regular price must be positive'),
  sellingPrice:  z.number().positive('Selling price must be positive'),
  minimumPrice:  z.number().positive('Minimum price must be positive'),
  billingType:   z.nativeEnum(BillingType),
  effectiveDate: z.string().datetime({ offset: true }).or(z.string().date()),
  status:        z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
}).refine((d) => d.sellingPrice >= d.minimumPrice, {
  message: 'Selling price cannot be lower than minimum price',
  path: ['sellingPrice'],
}).refine((d) => d.regularPrice >= d.sellingPrice, {
  message: 'Regular price cannot be lower than selling price',
  path: ['regularPrice'],
});

/* ─── Select shapes ───────────────────────────────────────────────────────── */
const PRICE_SELECT = {
  id:           true,
  productId:    true,
  regularPrice: true,
  sellingPrice: true,
  minimumPrice: true,
  billingType:  true,
  effectiveDate: true,
  status:       true,
  createdAt:    true,
  updatedAt:    true,
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

const HISTORY_SELECT = {
  id:            true,
  productPriceId: true,
  oldPrice:      true,
  newPrice:      true,
  changedAt:     true,
  changedBy: { select: { id: true, name: true, email: true } },
} as const;

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function notFound(msg: string): never {
  throw Object.assign(new Error(msg), { code: 'NOT_FOUND', status: 404 });
}

async function assertProduct(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) notFound('Product not found');
  return product;
}

/** Current active price: latest ACTIVE row with effectiveDate <= now */
async function getCurrentActivePrice(productId: string) {
  return prisma.productPrice.findFirst({
    where: {
      productId,
      status: UserStatus.ACTIVE,
      effectiveDate: { lte: new Date() },
    },
    orderBy: { effectiveDate: 'desc' },
    select: PRICE_SELECT,
  });
}

/* ─── List prices for a product ───────────────────────────────────────────── */
export async function listPrices(
  productId: string,
  query: Record<string, unknown>
) {
  await assertProduct(productId);

  const extraWhere: Prisma.ProductPriceWhereInput = { productId };

  const { skip, take, orderBy, where, page, limit } =
    applyListQuery<Prisma.ProductPriceWhereInput>(
      query,
      extraWhere,
      [] // no text search on prices
    );

  const [rows, total] = await Promise.all([
    prisma.productPrice.findMany({
      where,
      orderBy: orderBy.length ? orderBy : [{ effectiveDate: 'desc' }],
      skip,
      take,
      select: PRICE_SELECT,
    }),
    prisma.productPrice.count({ where }),
  ]);

  const current = await getCurrentActivePrice(productId);

  return {
    data: rows,
    meta: { ...buildMeta(total, page, limit), currentPriceId: current?.id ?? null },
  };
}

/* ─── Get current active price ────────────────────────────────────────────── */
export async function getCurrentPrice(productId: string) {
  await assertProduct(productId);
  const price = await getCurrentActivePrice(productId);
  if (!price) notFound('No active price found for this product');
  return price;
}

/* ─── Add a new price (NEVER UPDATE the old row) ─────────────────────────── */
export async function addPrice(
  productId: string,
  raw: unknown,
  actorId: string,
  ipAddress?: string | null
) {
  await assertProduct(productId);
  const input = createPriceSchema.parse(raw);

  // Fetch the current active price so we can write a history row
  const oldPrice = await getCurrentActivePrice(productId);

  const newPrice = await prisma.$transaction(async (tx) => {
    // 1. Deactivate the current price (status → INACTIVE) if one exists
    if (oldPrice) {
      await tx.productPrice.update({
        where: { id: oldPrice.id },
        data: { status: UserStatus.INACTIVE },
      });
    }

    // 2. Create the new price row
    const created = await tx.productPrice.create({
      data: {
        productId,
        regularPrice:  input.regularPrice,
        sellingPrice:  input.sellingPrice,
        minimumPrice:  input.minimumPrice,
        billingType:   input.billingType,
        effectiveDate: new Date(input.effectiveDate),
        status:        input.status,
        createdById:   actorId,
      },
      select: PRICE_SELECT,
    });

    // 3. Write history row: old selling → new selling
    await tx.productPriceHistory.create({
      data: {
        productPriceId: created.id,
        oldPrice: oldPrice ? oldPrice.sellingPrice : created.sellingPrice,
        newPrice: created.sellingPrice,
        changedById: actorId,
      },
    });

    return created;
  });

  await audit({
    actor: { id: actorId, role: 'ADMIN' as const },
    module: 'PRICES',
    action: 'PRICE_CHANGE',
    entityId: newPrice.id,
    entityLabel: `Price for product #${productId}`,
    summary: oldPrice
      ? `Price changed from ${oldPrice.sellingPrice} → ${newPrice.sellingPrice} (productId=${productId})`
      : `Initial price set: sellingPrice=${newPrice.sellingPrice} (productId=${productId})`,
    details: {
      old: oldPrice ? {
        priceId:      oldPrice.id,
        sellingPrice: oldPrice.sellingPrice,
        regularPrice: oldPrice.regularPrice,
        minimumPrice: oldPrice.minimumPrice,
        billingType:  oldPrice.billingType,
        effectiveDate: oldPrice.effectiveDate,
      } : null,
      new: {
        priceId:      newPrice.id,
        sellingPrice: newPrice.sellingPrice,
        regularPrice: newPrice.regularPrice,
        minimumPrice: newPrice.minimumPrice,
        billingType:  newPrice.billingType,
        effectiveDate: newPrice.effectiveDate,
      },
      productId,
    } as unknown as Prisma.InputJsonValue,
    ipAddress,
  });

  return newPrice;
}

/* ─── "Update" a price row — creates new row + history (per spec) ────────── */
export async function updatePrice(
  productId: string,
  priceId: string,
  raw: unknown,
  actorId: string,
  ipAddress?: string | null
) {
  await assertProduct(productId);

  // Verify the price row belongs to this product
  const existingPrice = await prisma.productPrice.findFirst({
    where: { id: priceId, productId },
    select: PRICE_SELECT,
  });
  if (!existingPrice) notFound('Price not found for this product');

  const input = createPriceSchema.parse(raw);

  const newPrice = await prisma.$transaction(async (tx) => {
    // 1. Deactivate the referenced price row
    await tx.productPrice.update({
      where: { id: priceId },
      data: { status: UserStatus.INACTIVE },
    });

    // 2. Create new price row
    const created = await tx.productPrice.create({
      data: {
        productId,
        regularPrice:  input.regularPrice,
        sellingPrice:  input.sellingPrice,
        minimumPrice:  input.minimumPrice,
        billingType:   input.billingType,
        effectiveDate: new Date(input.effectiveDate),
        status:        input.status,
        createdById:   actorId,
      },
      select: PRICE_SELECT,
    });

    // 3. History: old selling → new selling
    await tx.productPriceHistory.create({
      data: {
        productPriceId: created.id,
        oldPrice: existingPrice.sellingPrice,
        newPrice: created.sellingPrice,
        changedById: actorId,
      },
    });

    return created;
  });

  await audit({
    actor: { id: actorId, role: 'ADMIN' as const },
    module: 'PRICES',
    action: 'PRICE_CHANGE',
    entityId: newPrice.id,
    entityLabel: `Price for product #${productId} (update)`,
    summary: `Price update: sellingPrice ${existingPrice.sellingPrice} → ${newPrice.sellingPrice} (productId=${productId})`,
    details: {
      old: {
        priceId:      existingPrice.id,
        sellingPrice: existingPrice.sellingPrice,
        regularPrice: existingPrice.regularPrice,
        minimumPrice: existingPrice.minimumPrice,
        billingType:  existingPrice.billingType,
        effectiveDate: existingPrice.effectiveDate,
      },
      new: {
        priceId:      newPrice.id,
        sellingPrice: newPrice.sellingPrice,
        regularPrice: newPrice.regularPrice,
        minimumPrice: newPrice.minimumPrice,
        billingType:  newPrice.billingType,
        effectiveDate: newPrice.effectiveDate,
      },
      productId,
      sourcePriceId: priceId,
    } as unknown as Prisma.InputJsonValue,
    ipAddress,
  });

  return newPrice;
}

/* ─── Price history for a product ────────────────────────────────────────── */
export async function getPriceHistory(
  productId: string,
  query: Record<string, unknown>
) {
  await assertProduct(productId);

  // Get all price IDs for this product first
  const priceIds = await prisma.productPrice.findMany({
    where: { productId },
    select: { id: true },
  });

  const ids = priceIds.map((p) => p.id);
  if (ids.length === 0) return { data: [], meta: buildMeta(0, 1, 20) };

  const extraWhere: Prisma.ProductPriceHistoryWhereInput = {
    productPriceId: { in: ids },
  };

  const { skip, take, page, limit } =
    applyListQuery<Prisma.ProductPriceHistoryWhereInput>(query, extraWhere, []);

  const [rows, total] = await Promise.all([
    prisma.productPriceHistory.findMany({
      where: extraWhere,
      orderBy: { changedAt: 'desc' },
      skip,
      take,
      select: HISTORY_SELECT,
    }),
    prisma.productPriceHistory.count({ where: extraWhere }),
  ]);

  return { data: rows, meta: buildMeta(total, page, limit) };
}
