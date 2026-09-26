import { z } from 'zod';
import { UserStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { applyListQuery, buildMeta } from '../../lib/list-query';
import { audit, buildFieldChanges } from '../../lib/audit';

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */
export const createProductSchema = z.object({
  categoryId:  z.string().uuid('Invalid categoryId'),
  name:        z.string().min(1, 'Name is required').max(200),
  description: z.string().max(500).optional(),
  unit:        z.string().min(1, 'Unit is required').max(50),
  status:      z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
});

export const updateProductSchema = z.object({
  categoryId:  z.string().uuid().optional(),
  name:        z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  unit:        z.string().min(1).max(50).optional(),
  status:      z.nativeEnum(UserStatus).optional(),
}).strict();

/* ─── Select shape ────────────────────────────────────────────────────────── */
const PRODUCT_SELECT = {
  id:          true,
  name:        true,
  description: true,
  unit:        true,
  status:      true,
  createdAt:   true,
  updatedAt:   true,
  category: {
    select: {
      id:      true,
      name:    true,
      service: { select: { id: true, name: true } },
    },
  },
} as const;

/* ─── List ────────────────────────────────────────────────────────────────── */
export async function listProducts(query: Record<string, unknown>) {
  const categoryId = query.categoryId as string | undefined;
  const serviceId  = query.serviceId  as string | undefined;

  const extraWhere: Prisma.ProductWhereInput = {};
  if (categoryId) extraWhere.categoryId = categoryId;
  if (serviceId)  extraWhere.serviceId  = serviceId;

  const { skip, take, orderBy, where, page, limit } =
    applyListQuery<Prisma.ProductWhereInput>(query, extraWhere, ['name', 'description']);

  const [rows, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy, skip, take, select: PRODUCT_SELECT }),
    prisma.product.count({ where }),
  ]);

  return { data: rows, meta: buildMeta(total, page, limit) };
}

/* ─── Get one ─────────────────────────────────────────────────────────────── */
export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, select: PRODUCT_SELECT });
  if (!product) throw Object.assign(new Error('Product not found'), { code: 'NOT_FOUND', status: 404 });
  return product;
}

/* ─── Create ──────────────────────────────────────────────────────────────── */
export async function createProduct(raw: unknown, actorId?: string) {
  const input = createProductSchema.parse(raw);

  // Verify category exists and pull serviceId from it
  const category = await prisma.productCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) {
    throw Object.assign(new Error('Category not found'), { code: 'NOT_FOUND', status: 404 });
  }

  // No hard unique constraint on product name in schema, but enforce per category
  const existing = await prisma.product.findFirst({
    where: {
      categoryId: input.categoryId,
      name: { equals: input.name.trim(), mode: 'insensitive' },
    },
  });
  if (existing) {
    throw Object.assign(
      new Error(`Product "${input.name}" already exists in this category`),
      { code: 'CONFLICT', status: 409 }
    );
  }

  return prisma.product.create({
    data: {
      categoryId:  input.categoryId,
      serviceId:   category.serviceId,   // auto-derive from category
      name:        input.name.trim(),
      description: input.description ?? null,
      unit:        input.unit.trim(),
      status:      input.status,
    },
    select: PRODUCT_SELECT,
  }).then((p) => {
    if (actorId) void audit({
      actor: { id: actorId, role: 'ADMIN' as const },
      module: 'PRODUCTS',
      action: 'CREATE',
      entityId: p.id,
      entityLabel: p.name,
      summary: `Created product "${p.name}"`,
      details: { categoryId: p.category?.id, categoryName: p.category?.name } as unknown as Prisma.InputJsonValue,
    });
    return p;
  });
}

/* ─── Update ──────────────────────────────────────────────────────────────── */
export async function updateProduct(id: string, raw: unknown, actorId?: string) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error('Product not found'), { code: 'NOT_FOUND', status: 404 });

  const input = updateProductSchema.parse(raw);
  const data: Prisma.ProductUpdateInput = {};

  if (input.categoryId !== undefined) {
    const cat = await prisma.productCategory.findUnique({ where: { id: input.categoryId } });
    if (!cat) throw Object.assign(new Error('Category not found'), { code: 'NOT_FOUND', status: 404 });
    data.category = { connect: { id: input.categoryId } };
    data.service  = { connect: { id: cat.serviceId } };
  }

  const targetCategoryId = input.categoryId ?? existing.categoryId;
  const targetName       = input.name?.trim() ?? existing.name;

  if (input.name !== undefined || input.categoryId !== undefined) {
    const dup = await prisma.product.findFirst({
      where: {
        categoryId: targetCategoryId,
        name: { equals: targetName, mode: 'insensitive' },
        id: { not: id },
      },
    });
    if (dup) {
      throw Object.assign(
        new Error(`Product "${targetName}" already exists in that category`),
        { code: 'CONFLICT', status: 409 }
      );
    }
    if (input.name !== undefined) data.name = targetName;
  }

  if (input.description !== undefined) data.description = input.description;
  if (input.unit !== undefined)        data.unit        = input.unit.trim();
  if (input.status !== undefined)      data.status      = input.status;

  const updated = prisma.product.update({ where: { id }, data, select: PRODUCT_SELECT });

  if (actorId) {
    void updated.then((p) => audit({
      actor: { id: actorId, role: 'ADMIN' as const },
      module: 'PRODUCTS',
      action: 'UPDATE',
      entityId: p.id,
      entityLabel: p.name,
      summary: `Updated product "${p.name}" (fields: ${buildFieldChanges(existing as unknown as Record<string,unknown>, data as unknown as Record<string,unknown>).changed.length})`,
      details: buildFieldChanges(
        existing as unknown as Record<string, unknown>,
        data as unknown as Record<string, unknown>
      ) as unknown as Prisma.InputJsonValue,
    }));
  }
  return updated;
}

/* ─── Delete ──────────────────────────────────────────────────────────────── */
export async function deleteProduct(id: string, actorId?: string) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error('Product not found'), { code: 'NOT_FOUND', status: 404 });

  // Block if active prices, quotation items, or order items reference this product
  const [priceCount, quoteItemCount, orderItemCount] = await Promise.all([
    prisma.productPrice.count({ where: { productId: id, status: UserStatus.ACTIVE } }),
    prisma.quotationItem.count({ where: { productId: id } }),
    prisma.salesOrderItem.count({ where: { productId: id } }),
  ]);

  if (priceCount + quoteItemCount + orderItemCount > 0) {
    throw Object.assign(
      new Error('Cannot delete product that has active prices, quotation items, or order items'),
      { code: 'CONFLICT', status: 409 }
    );
  }

  await prisma.product.delete({ where: { id } });
  if (actorId) void audit({
    actor: { id: actorId, role: 'ADMIN' as const },
    module: 'PRODUCTS',
    action: 'DELETE',
    entityId: existing.id,
    entityLabel: existing.name,
    summary: `Deleted product "${existing.name}"`,
    details: { categoryId: existing.categoryId, statusBefore: existing.status } as unknown as Prisma.InputJsonValue,
  });
  return { id, deleted: true };
}
