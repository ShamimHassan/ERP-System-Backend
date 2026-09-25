import { z } from 'zod';
import { UserStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { applyListQuery, buildMeta } from '../../lib/list-query';

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */
export const createCategorySchema = z.object({
  serviceId: z.string().uuid('Invalid serviceId'),
  name:      z.string().min(1, 'Name is required').max(100),
  status:    z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
});

export const updateCategorySchema = z.object({
  name:      z.string().min(1).max(100).optional(),
  serviceId: z.string().uuid().optional(),
  status:    z.nativeEnum(UserStatus).optional(),
}).strict();

/* ─── Select shape ────────────────────────────────────────────────────────── */
const CATEGORY_SELECT = {
  id:        true,
  name:      true,
  status:    true,
  createdAt: true,
  updatedAt: true,
  service:   { select: { id: true, name: true } },
} as const;

/* ─── List ────────────────────────────────────────────────────────────────── */
export async function listCategories(query: Record<string, unknown>) {
  const serviceId = query.serviceId as string | undefined;

  const extraWhere: Prisma.ProductCategoryWhereInput = {};
  if (serviceId) extraWhere.serviceId = serviceId;

  const { skip, take, orderBy, where, page, limit } =
    applyListQuery<Prisma.ProductCategoryWhereInput>(query, extraWhere, ['name']);

  const [rows, total] = await Promise.all([
    prisma.productCategory.findMany({ where, orderBy, skip, take, select: CATEGORY_SELECT }),
    prisma.productCategory.count({ where }),
  ]);

  return { data: rows, meta: buildMeta(total, page, limit) };
}

/* ─── Get one ─────────────────────────────────────────────────────────────── */
export async function getCategory(id: string) {
  const cat = await prisma.productCategory.findUnique({ where: { id }, select: CATEGORY_SELECT });
  if (!cat) throw Object.assign(new Error('Category not found'), { code: 'NOT_FOUND', status: 404 });
  return cat;
}

/* ─── Create ──────────────────────────────────────────────────────────────── */
export async function createCategory(raw: unknown) {
  const input = createCategorySchema.parse(raw);

  // Verify service exists
  const svc = await prisma.service.findUnique({ where: { id: input.serviceId } });
  if (!svc) throw Object.assign(new Error('Service not found'), { code: 'NOT_FOUND', status: 404 });

  // Enforce @@unique([serviceId, name])
  const existing = await prisma.productCategory.findUnique({
    where: { serviceId_name: { serviceId: input.serviceId, name: input.name.trim() } },
  });
  if (existing) {
    throw Object.assign(
      new Error(`Category "${input.name}" already exists under this service`),
      { code: 'CONFLICT', status: 409 }
    );
  }

  return prisma.productCategory.create({
    data: { serviceId: input.serviceId, name: input.name.trim(), status: input.status },
    select: CATEGORY_SELECT,
  });
}

/* ─── Update ──────────────────────────────────────────────────────────────── */
export async function updateCategory(id: string, raw: unknown) {
  const existing = await prisma.productCategory.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error('Category not found'), { code: 'NOT_FOUND', status: 404 });

  const input = updateCategorySchema.parse(raw);
  const data: Prisma.ProductCategoryUpdateInput = {};

  const targetServiceId = input.serviceId ?? existing.serviceId;
  const targetName      = input.name?.trim() ?? existing.name;

  if (input.serviceId !== undefined) {
    const svc = await prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!svc) throw Object.assign(new Error('Service not found'), { code: 'NOT_FOUND', status: 404 });
    data.service = { connect: { id: input.serviceId } };
  }

  if (input.name !== undefined || input.serviceId !== undefined) {
    // Check uniqueness if name or service changed
    const dup = await prisma.productCategory.findUnique({
      where: { serviceId_name: { serviceId: targetServiceId, name: targetName } },
    });
    if (dup && dup.id !== id) {
      throw Object.assign(
        new Error(`Category "${targetName}" already exists under that service`),
        { code: 'CONFLICT', status: 409 }
      );
    }
    if (input.name !== undefined) data.name = targetName;
  }

  if (input.status !== undefined) data.status = input.status;

  return prisma.productCategory.update({ where: { id }, data, select: CATEGORY_SELECT });
}

/* ─── Delete ──────────────────────────────────────────────────────────────── */
export async function deleteCategory(id: string) {
  const existing = await prisma.productCategory.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error('Category not found'), { code: 'NOT_FOUND', status: 404 });

  const productCount = await prisma.product.count({ where: { categoryId: id } });
  if (productCount > 0) {
    throw Object.assign(
      new Error('Cannot delete category with existing products. Remove products first.'),
      { code: 'CONFLICT', status: 409 }
    );
  }

  await prisma.productCategory.delete({ where: { id } });
  return { id, deleted: true };
}
