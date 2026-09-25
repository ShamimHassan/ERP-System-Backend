import { z } from 'zod';
import { UserStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { applyListQuery, buildMeta } from '../../lib/list-query';

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */
export const createServiceSchema = z.object({
  name:        z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  status:      z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
});

export const updateServiceSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  status:      z.nativeEnum(UserStatus).optional(),
}).strict();

/* ─── Select shape ────────────────────────────────────────────────────────── */
const SERVICE_SELECT = {
  id:          true,
  name:        true,
  description: true,
  status:      true,
  createdAt:   true,
  updatedAt:   true,
} as const;

/* ─── List ────────────────────────────────────────────────────────────────── */
export async function listServices(query: Record<string, unknown>) {
  const { skip, take, orderBy, where, page, limit } = applyListQuery<Prisma.ServiceWhereInput>(
    query,
    {},
    ['name', 'description']
  );

  const [rows, total] = await Promise.all([
    prisma.service.findMany({ where, orderBy, skip, take, select: SERVICE_SELECT }),
    prisma.service.count({ where }),
  ]);

  return { data: rows, meta: buildMeta(total, page, limit) };
}

/* ─── Get one ─────────────────────────────────────────────────────────────── */
export async function getService(id: string) {
  const svc = await prisma.service.findUnique({ where: { id }, select: SERVICE_SELECT });
  if (!svc) throw Object.assign(new Error('Service not found'), { code: 'NOT_FOUND', status: 404 });
  return svc;
}

/* ─── Create ──────────────────────────────────────────────────────────────── */
export async function createService(raw: unknown) {
  const input = createServiceSchema.parse(raw);

  const existing = await prisma.service.findFirst({
    where: { name: { equals: input.name.trim(), mode: 'insensitive' } },
  });
  if (existing) {
    throw Object.assign(new Error(`Service "${input.name}" already exists`), { code: 'CONFLICT', status: 409 });
  }

  return prisma.service.create({
    data: { name: input.name.trim(), description: input.description ?? null, status: input.status },
    select: SERVICE_SELECT,
  });
}

/* ─── Update ──────────────────────────────────────────────────────────────── */
export async function updateService(id: string, raw: unknown) {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error('Service not found'), { code: 'NOT_FOUND', status: 404 });

  const input = updateServiceSchema.parse(raw);
  const data: Prisma.ServiceUpdateInput = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    const dup = await prisma.service.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } },
    });
    if (dup) throw Object.assign(new Error(`Service "${name}" already exists`), { code: 'CONFLICT', status: 409 });
    data.name = name;
  }
  if (input.description !== undefined) data.description = input.description;
  if (input.status !== undefined) data.status = input.status;

  return prisma.service.update({ where: { id }, data, select: SERVICE_SELECT });
}

/* ─── Delete ──────────────────────────────────────────────────────────────── */
export async function deleteService(id: string) {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error('Service not found'), { code: 'NOT_FOUND', status: 404 });

  // Block deletion if categories or products exist
  const catCount = await prisma.productCategory.count({ where: { serviceId: id } });
  if (catCount > 0) {
    throw Object.assign(
      new Error('Cannot delete service with existing categories. Remove categories first.'),
      { code: 'CONFLICT', status: 409 }
    );
  }

  await prisma.service.delete({ where: { id } });
  return { id, deleted: true };
}
