import type { Prisma } from '@prisma/client';

export interface ListQueryInput {
  page?: string | number;
  limit?: string | number;
  sort?: string;
  search?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ListQueryResult<TWhere = Prisma.UserWhereInput> {
  skip: number;
  take: number;
  orderBy: Prisma.UserOrderByWithRelationInput[];
  where: TWhere;
  page: number;
  limit: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function buildOrderBy<TOrderBy = Prisma.UserOrderByWithRelationInput>(
  sort?: string,
  defaultOrder: TOrderBy[] = [{ createdAt: 'desc' } as unknown as TOrderBy]
): TOrderBy[] {
  if (!sort) return defaultOrder;
  const parts = sort.split(',').map((s) => s.trim()).filter(Boolean);
  const result: TOrderBy[] = [];
  for (const part of parts) {
    const desc = part.startsWith('-');
    const field = (desc ? part.slice(1) : part).trim();
    if (!field) continue;
    const order = desc ? 'desc' : 'asc';
    result.push({ [field]: order } as unknown as TOrderBy);
  }
  return result.length ? result : defaultOrder;
}

export function applyListQuery<TWhere extends object = Prisma.UserWhereInput>(
  query: ListQueryInput,
  extraWhere: Partial<TWhere> = {} as Partial<TWhere>,
  searchFields: string[] = ['name', 'email']
): ListQueryResult<TWhere> {
  const page = clamp(Number(query.page ?? 1), 1, 10000);
  const limit = clamp(Number(query.limit ?? 20), 1, 100);
  const skip = (page - 1) * limit;
  const orderBy = buildOrderBy(query.sort as string | undefined);
  const where: Record<string, unknown> = { ...extraWhere };

  if (query.status) {
    where.status = query.status;
  }

  const search = String(query.search ?? '').trim();
  if (search && searchFields.length) {
    where.AND = (where.AND ?? []) as unknown[];
    (where.AND as unknown[]).push({
      OR: searchFields.map((f) => ({
        [f]: { contains: search, mode: 'insensitive' },
      })),
    });
  }

  return {
    skip,
    take: limit,
    orderBy,
    where: where as TWhere,
    page,
    limit,
  };
}

export function buildMeta(total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return { page, limit, total, totalPages };
}
