import type { Prisma } from '@prisma/client';

export interface ListQueryInput {
  page?: string | number;
  limit?: string | number;
  sort?: string;
  search?: string;
  status?: string;
  /** ISO date string YYYY-MM-DD — applied to `createdAt` by default */
  dateFrom?: string;
  /** ISO date string YYYY-MM-DD — applied to `createdAt` by default */
  dateTo?: string;
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
    result.push({ [field]: desc ? 'desc' : 'asc' } as unknown as TOrderBy);
  }
  return result.length ? result : defaultOrder;
}

/**
 * applyListQuery — builds skip/take/orderBy/where from a flat query object.
 *
 * Handles automatically:
 *  - page / limit (clamped, defaults 1 / 20)
 *  - sort         ("-createdAt" → {createdAt:'desc'}, comma-separated)
 *  - search       (OR contains across searchFields, case-insensitive)
 *  - status       (exact match — value forwarded as-is for enum compatibility)
 *  - dateFrom / dateTo applied to `createdAt` range (opt-in via applyDateRange)
 *
 * @param query        raw req.query object (after validate middleware)
 * @param extraWhere   module-specific pre-built where conditions to merge
 * @param searchFields fields to run case-insensitive `contains` against
 * @param applyDateRange whether to auto-wire dateFrom/dateTo onto createdAt (default true)
 */
export function applyListQuery<TWhere extends object = Prisma.UserWhereInput>(
  query: ListQueryInput,
  extraWhere: Partial<TWhere> = {} as Partial<TWhere>,
  searchFields: string[] = ['name', 'email'],
  applyDateRange = true
): ListQueryResult<TWhere> {
  const page  = clamp(Number(query.page  ?? 1),  1,     10000);
  const limit = clamp(Number(query.limit ?? 20), 1,     100);
  const skip  = (page - 1) * limit;
  const orderBy = buildOrderBy(query.sort as string | undefined);

  const where: Record<string, unknown> = { ...extraWhere };
  const andClauses: unknown[] = (where.AND as unknown[] | undefined) ?? [];

  // ── Status filter ────────────────────────────────────────────────────────
  if (query.status) {
    where.status = query.status;
  }

  // ── Full-text search ─────────────────────────────────────────────────────
  const search = String(query.search ?? '').trim();
  if (search && searchFields.length) {
    andClauses.push({
      OR: searchFields.map((f) => ({
        [f]: { contains: search, mode: 'insensitive' },
      })),
    });
  }

  // ── Date range (createdAt) ───────────────────────────────────────────────
  if (applyDateRange && (query.dateFrom || query.dateTo)) {
    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (query.dateFrom) {
      const d = new Date(query.dateFrom as string);
      d.setHours(0, 0, 0, 0);
      createdAtFilter.gte = d;
    }
    if (query.dateTo) {
      const d = new Date(query.dateTo as string);
      d.setHours(23, 59, 59, 999);
      createdAtFilter.lte = d;
    }
    andClauses.push({ createdAt: createdAtFilter });
  }

  if (andClauses.length) {
    where.AND = andClauses;
  }

  return {
    skip,
    take:    limit,
    orderBy,
    where:   where as TWhere,
    page,
    limit,
  };
}

export function buildMeta(total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return { page, limit, total, totalPages };
}
