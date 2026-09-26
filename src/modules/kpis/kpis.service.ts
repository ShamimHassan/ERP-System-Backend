import {
  ActivityType,
  Metric,
  PeriodType,
  QuotationStatus,
  Role,
  SalesOrderStatus,
  InvoiceStatus,
  LeadStatus,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ownerFilter } from '../../lib/rbac';

export interface Actor {
  id: string;
  role: Role;
  managerId?: string | null;
  ip?: string | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/* ─── Period helpers ─────────────────────────────────────────────────────── */
export function periodBounds(periodType: PeriodType, periodStart: Date): { start: Date; end: Date } {
  const s = new Date(periodStart);
  s.setHours(0, 0, 0, 0);
  const e = new Date(s);
  switch (periodType) {
    case PeriodType.MONTHLY:
      e.setMonth(e.getMonth() + 1);
      break;
    case PeriodType.QUARTERLY:
      e.setMonth(e.getMonth() + 3);
      break;
    case PeriodType.YEARLY:
      e.setFullYear(e.getFullYear() + 1);
      break;
  }
  e.setMilliseconds(e.getMilliseconds() - 1);
  return { start: s, end: e };
}

function parseDateOr(value: unknown, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? fallback : d;
}

function startOfMonth(d = new Date()): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

/* ─── On-demand metric actual computation via Prisma aggregations ─────────── */
async function computeMetricActual(
  userId: string,
  metric: Metric,
  start: Date,
  end: Date
): Promise<number> {
  const ownerMP = { marketingPersonId: userId };
  const ownerAU = { assignedUserId: userId };
  const ownerAP = { assignedPersonId: userId };

  switch (metric) {
    case Metric.NEW_LEADS:
      return prisma.lead.count({
        where: { ...ownerMP, deletedAt: null, createdAt: { gte: start, lte: end } },
      });

    case Metric.QUALIFIED_LEADS:
      return prisma.lead.count({
        where: {
          ...ownerMP,
          deletedAt: null,
          status: { in: [LeadStatus.QUALIFIED, LeadStatus.PROPOSAL, LeadStatus.NEGOTIATION, LeadStatus.WON] },
          createdAt: { gte: start, lte: end },
        },
      });

    case Metric.CALLS:
      return prisma.activity.count({
        where: { ...ownerAU, type: ActivityType.CALL, activityDate: { gte: start, lte: end } },
      });

    case Metric.MEETINGS:
      return prisma.activity.count({
        where: { ...ownerAU, type: ActivityType.MEETING, activityDate: { gte: start, lte: end } },
      });

    case Metric.SURVEYS:
      return prisma.survey.count({
        where: { ...ownerAP, surveyDate: { gte: start, lte: end } },
      });

    case Metric.FOLLOW_UPS:
      return prisma.activity.count({
        where: { ...ownerAU, type: ActivityType.FOLLOW_UP, activityDate: { gte: start, lte: end } },
      });

    case Metric.QUOTATIONS:
      return prisma.quotation.count({
        where: { ...ownerMP, quotationDate: { gte: start, lte: end } },
      });

    case Metric.WON_DEALS:
      return prisma.salesOrder.count({
        where: {
          ...ownerMP,
          status: { in: [SalesOrderStatus.CONFIRMED, SalesOrderStatus.COMPLETED] },
          orderDate: { gte: start, lte: end },
        },
      });

    case Metric.NEW_CUSTOMERS:
      return prisma.customer.count({
        where: { ...ownerMP, deletedAt: null, createdAt: { gte: start, lte: end } },
      });

    case Metric.REVENUE: {
      const agg = await prisma.salesOrder.aggregate({
        _sum: { grandTotal: true },
        where: {
          ...ownerMP,
          status: SalesOrderStatus.COMPLETED,
          orderDate: { gte: start, lte: end },
        },
      });
      return Number(agg._sum.grandTotal ?? 0);
    }

    case Metric.COLLECTION: {
      const agg = await prisma.invoice.aggregate({
        _sum: { amount: true },
        where: {
          status: InvoiceStatus.PAID,
          paidAt: { gte: start, lte: end },
          salesOrder: ownerMP,
        },
      });
      return Number(agg._sum.amount ?? 0);
    }

    case Metric.CONVERSION_RATE: {
      const [newLeads, quotationsApproved] = await Promise.all([
        prisma.lead.count({
          where: { ...ownerMP, deletedAt: null, createdAt: { gte: start, lte: end } },
        }),
        prisma.quotation.count({
          where: {
            ...ownerMP,
            status: { in: [QuotationStatus.APPROVED, QuotationStatus.CONVERTED] },
            quotationDate: { gte: start, lte: end },
          },
        }),
      ]);
      return newLeads > 0 ? round2((quotationsApproved / newLeads) * 100) : 0;
    }

    default:
      return 0;
  }
}

/* ─── Bulk compute all metrics for a user & period ───────────────────────── */
async function computeAllMetrics(
  userId: string,
  periodType: PeriodType,
  periodStart: Date
) {
  const { start, end } = periodBounds(periodType, periodStart);
  const metrics = Object.values(Metric) as Metric[];
  const results: Record<string, number> = {};
  for (const m of metrics) {
    results[m] = await computeMetricActual(userId, m, start, end);
  }
  return results;
}

/* ─── Resolve target scoped user ids for target GET/POST (RBAC) ─────────── */
async function resolveTargetableUserIds(
  actor: Actor,
  requestedUserId?: string
): Promise<string[]> {
  if (actor.role === Role.ADMIN) {
    if (requestedUserId) return [requestedUserId];
    const all = await prisma.user.findMany({ where: { deletedAt: null }, select: { id: true } });
    return all.map((u) => u.id);
  }
  if (actor.role === Role.MANAGER) {
    const team = await prisma.user.findMany({
      where: { deletedAt: null, OR: [{ id: actor.id }, { managerId: actor.id }] },
      select: { id: true },
    });
    const teamIds = team.map((u) => u.id);
    if (requestedUserId) {
      if (!teamIds.includes(requestedUserId)) {
        throw Object.assign(new Error('Requested userId outside your team scope'), {
          code: 'FORBIDDEN', status: 403,
        });
      }
      return [requestedUserId];
    }
    return teamIds;
  }
  // MARKETING: only self
  return [actor.id];
}

/* ─── Public: GET /api/kpis ─────────────────────────────────────────────── */
export interface KpiRow {
  userId: string;
  userName: string;
  userEmail?: string;
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
  metric: Metric;
  targetValue: number;
  actualValue: number;
  achievementPct: number;
}

export async function getKpis(
  actor: Actor,
  visibleUserIds: string[] | null,
  query: Record<string, unknown>
) {
  const periodType = (String(query.period ?? 'MONTHLY') as PeriodType);
  const periodStart = parseDateOr(query.periodStart, startOfMonth());
  const requestedUserId = query.userId ? String(query.userId) : undefined;

  let userIds: string[];
  try {
    userIds = await resolveTargetableUserIds(actor, requestedUserId);
  } catch (e) {
    if (requestedUserId && actor.role !== Role.ADMIN) {
      // Manager scope filter: also must be inside visibleUserIds
      if (visibleUserIds !== null && !visibleUserIds.includes(requestedUserId)) {
        userIds = [];
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }

  // Intersect with visibleUserIds when present (double-safe scoping)
  if (visibleUserIds !== null) {
    userIds = userIds.filter((id) => visibleUserIds.includes(id));
  }

  const { start: pStart, end: pEnd } = periodBounds(periodType, periodStart);

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  const usersById = new Map(users.map((u) => [u.id, u]));

  // Load existing targets for these users + period + all metrics
  const targets = await prisma.target.findMany({
    where: {
      userId: { in: userIds },
      periodType,
      periodStart: { gte: new Date(pStart.getFullYear(), pStart.getMonth(), pStart.getDate()), lte: new Date(pStart.getFullYear(), pStart.getMonth(), pStart.getDate()) },
    },
  });
  const targetKey = (uid: string, m: Metric) => `${uid}__${m}`;
  const targetsByKey = new Map<string, number>();
  targets.forEach((t) => {
    targetsByKey.set(targetKey(t.userId, t.metric), Number(t.targetValue));
  });

  const rows: KpiRow[] = [];
  const allMetrics = Object.values(Metric) as Metric[];

  for (const uid of userIds) {
    if (!usersById.has(uid)) continue;
    const u = usersById.get(uid)!;
    const actuals = await computeAllMetrics(uid, periodType, pStart);

    for (const m of allMetrics) {
      const targetValue = targetsByKey.get(targetKey(uid, m)) ?? 0;
      const actualValue = Number(actuals[m] ?? 0);
      const achievementPct = targetValue > 0 ? round2((actualValue / targetValue) * 100) : actualValue > 0 ? 100 : 0;
      rows.push({
        userId: uid,
        userName: u.name,
        userEmail: u.email,
        periodType,
        periodStart: pStart.toISOString().slice(0, 10),
        periodEnd: pEnd.toISOString().slice(0, 10),
        metric: m,
        targetValue: round2(targetValue),
        actualValue: round2(actualValue),
        achievementPct,
      });
    }
  }

  return { rows, meta: { count: rows.length, periodType, periodStart: pStart.toISOString().slice(0, 10) } };
}

/* ─── Public: List Targets ──────────────────────────────────────────────── */
export async function listTargets(
  actor: Actor,
  query: Record<string, unknown>
) {
  const userId = query.userId ? String(query.userId) : undefined;
  const periodType = query.periodType ? (String(query.periodType) as PeriodType) : undefined;
  const periodStart = query.periodStart ? parseDateOr(query.periodStart, startOfMonth()) : undefined;

  const userIds = await resolveTargetableUserIds(actor, userId);
  const where: Record<string, unknown> = { userId: { in: userIds } };
  if (periodType) where.periodType = periodType;
  if (periodStart) {
    const s = new Date(periodStart); s.setHours(0,0,0,0);
    const e = new Date(s); e.setDate(e.getDate() + 1);
    where.periodStart = { gte: s, lt: e };
  }

  const [items, total] = await Promise.all([
    prisma.target.findMany({
      where: where as never,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: [{ periodStart: 'desc' }, { userId: 'asc' }, { metric: 'asc' }],
    }),
    prisma.target.count({ where: where as never }),
  ]);

  return {
    data: items.map((t) => ({
      id: t.id,
      userId: t.userId,
      userName: t.user.name,
      userRole: t.user.role,
      periodType: t.periodType,
      periodStart: t.periodStart.toISOString().slice(0, 10),
      periodEnd: t.periodEnd.toISOString().slice(0, 10),
      metric: t.metric,
      targetValue: Number(t.targetValue),
    })),
    meta: { total },
  };
}

/* ─── Public: Set / Upsert Target ───────────────────────────────────────── */
export async function setTarget(
  actor: Actor,
  input: {
    userId: string;
    periodType: PeriodType;
    periodStart: string;
    metric: Metric;
    targetValue: number;
  }
) {
  // Only ADMIN and MANAGER can set targets
  if (actor.role === Role.MARKETING) {
    throw Object.assign(new Error('Marketing users cannot set targets'), { code: 'FORBIDDEN', status: 403 });
  }
  // Validate targetable
  await resolveTargetableUserIds(actor, input.userId);

  const periodStart = parseDateOr(input.periodStart, startOfMonth());
  const { end: periodEnd } = periodBounds(input.periodType, periodStart);

  const targetValue = Number(input.targetValue);
  if (isNaN(targetValue) || targetValue < 0) {
    throw Object.assign(new Error('targetValue must be a non-negative number'), {
      code: 'VALIDATION_ERROR', status: 400,
    });
  }

  const existing = await prisma.target.findFirst({
    where: {
      userId: input.userId,
      periodType: input.periodType,
      metric: input.metric,
      periodStart: {
        gte: new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate()),
        lt:  new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + 1),
      },
    },
  });

  const data = {
    userId: input.userId,
    periodType: input.periodType,
    periodStart: new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate()),
    periodEnd,
    metric: input.metric,
    targetValue,
  };

  if (existing) {
    const updated = await prisma.target.update({ where: { id: existing.id }, data });
    return { target: updated, created: false };
  }
  const created = await prisma.target.create({ data });
  return { target: created, created: true };
}

/* ─── Ownership filter scoping helpers (re-used for visibleUserIds in reports) ─── */
export { ownerFilter };

