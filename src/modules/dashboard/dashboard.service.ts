import {
  LeadStatus,
  OpportunityStage,
  QuotationStatus,
  Role,
  SalesOrderStatus,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ownerFilter } from '../../lib/rbac';

/* ─── Actor context ─────────────────────────────────────────────────────── */
export interface Actor {
  id: string;
  role: Role;
  managerId?: string | null;
  ip?: string | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

async function loadUsersByIds(ids: string[]) {
  return prisma.user.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, name: true, email: true, role: true, managerId: true },
    orderBy: { name: 'asc' },
  });
}

/* ─── Per-user KPIs: group-by aggregations across Lead / Opportunity /
 * Quotation / SalesOrder / Customer tables for the given user scope.  */
async function perUserKpis(visibleUserIds: string[] | null) {
  const scope = ownerFilter('marketingPersonId', visibleUserIds);

  const [leads, opps, quotesWon, ordersCompleted, customers] = await Promise.all([
    prisma.lead.groupBy({
      by: ['marketingPersonId'],
      where: { ...scope, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.opportunity.groupBy({
      by: ['marketingPersonId'],
      where: scope,
      _count: { _all: true },
    }),
    prisma.quotation.groupBy({
      by: ['marketingPersonId'],
      where: {
        ...scope,
        status: { in: [QuotationStatus.APPROVED, QuotationStatus.CONVERTED] },
      },
      _count: { _all: true },
      _sum: { grandTotal: true },
    }),
    prisma.salesOrder.groupBy({
      by: ['marketingPersonId'],
      where: { ...scope, status: SalesOrderStatus.COMPLETED },
      _count: { _all: true },
      _sum: { grandTotal: true },
    }),
    prisma.customer.groupBy({
      by: ['marketingPersonId'],
      where: { ...scope, deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  type Row = {
    leads: number; opportunities: number; quotationsWon: number;
    quotationsApprovedRevenue: number; ordersCompleted: number;
    revenueYtd: number; newCustomers: number;
  };
  const empty = (): Row => ({
    leads: 0, opportunities: 0, quotationsWon: 0,
    quotationsApprovedRevenue: 0, ordersCompleted: 0,
    revenueYtd: 0, newCustomers: 0,
  });
  const lookup: Record<string, Row> = {};
  const ensure = (uid: string): Row => (lookup[uid] ??= empty());

  leads.forEach((r) => (ensure(r.marketingPersonId).leads = r._count._all));
  opps.forEach((r) => (ensure(r.marketingPersonId).opportunities = r._count._all));
  quotesWon.forEach((r) => {
    const row = ensure(r.marketingPersonId);
    row.quotationsWon = r._count._all;
    row.quotationsApprovedRevenue = Number(r._sum.grandTotal ?? 0);
  });
  ordersCompleted.forEach((r) => {
    const row = ensure(r.marketingPersonId);
    row.ordersCompleted = r._count._all;
    row.revenueYtd = Number(r._sum.grandTotal ?? 0);
  });
  customers.forEach((r) => (ensure(r.marketingPersonId).newCustomers = r._count._all));

  return lookup;
}

/* ─── Global scope-level totals for the summary card ────────────────────── */
async function globalAggregates(visibleUserIds: string[] | null) {
  const scope = ownerFilter('marketingPersonId', visibleUserIds);

  const [
    leadsTotal, leadsWon,
    oppsTotal, oppsWon,
    quotTotal, quotApproved,
    ordersTotal, ordersCompleted,
    newCustomersTotal,
    revenueYtd,
  ] = await Promise.all([
    prisma.lead.count({ where: { ...scope, deletedAt: null } }),
    prisma.lead.count({ where: { ...scope, status: LeadStatus.WON, deletedAt: null } }),
    prisma.opportunity.count({ where: scope }),
    prisma.opportunity.count({ where: { ...scope, stage: OpportunityStage.WON } }),
    prisma.quotation.count({ where: scope }),
    prisma.quotation.count({
      where: {
        ...scope,
        status: { in: [QuotationStatus.APPROVED, QuotationStatus.CONVERTED] },
      },
    }),
    prisma.salesOrder.count({ where: scope }),
    prisma.salesOrder.count({ where: { ...scope, status: SalesOrderStatus.COMPLETED } }),
    prisma.customer.count({ where: { ...scope, deletedAt: null } }),
    prisma.salesOrder.aggregate({
      _sum: { grandTotal: true },
      where: { ...scope, status: SalesOrderStatus.COMPLETED },
    }),
  ]);

  return {
    leads: { total: leadsTotal, won: leadsWon },
    opportunities: { total: oppsTotal, won: oppsWon },
    quotations: { total: quotTotal, approved: quotApproved },
    orders: { total: ordersTotal, completed: ordersCompleted },
    newCustomers: newCustomersTotal,
    revenueYtd: Number(revenueYtd._sum.grandTotal ?? 0),
  };
}

/* ─── Upcoming activities: next 14 days, up to 10 items ─────────────────── */
async function upcomingActivities(visibleUserIds: string[] | null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const plus14 = new Date(today);
  plus14.setDate(today.getDate() + 14);
  plus14.setHours(23, 59, 59, 999);

  return prisma.activity.findMany({
    where: {
      ...ownerFilter('assignedUserId', visibleUserIds),
      activityDate: { gte: today, lte: plus14 },
    },
    orderBy: { activityDate: 'asc' },
    take: 10,
    select: {
      id: true, relatedType: true, relatedId: true, type: true,
      activityDate: true, activityTime: true, outcome: true,
      nextFollowUp: true, notes: true, status: true,
      assignedUserId: true,
      assignedUser: { select: { id: true, name: true, email: true } },
    },
  });
}

/* ─── Top 5 performers (by revenue YTD) ─────────────────────────────────── */
async function topPerformers(visibleUserIds: string[] | null) {
  const rows = await prisma.salesOrder.groupBy({
    by: ['marketingPersonId'],
    where: {
      ...ownerFilter('marketingPersonId', visibleUserIds),
      status: SalesOrderStatus.COMPLETED,
    },
    _sum: { grandTotal: true },
    _count: { _all: true },
    orderBy: { _sum: { grandTotal: 'desc' } },
    take: 5,
  });
  const users = await loadUsersByIds(rows.map((r) => r.marketingPersonId));
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    userId: r.marketingPersonId,
    userName: byId.get(r.marketingPersonId)?.name ?? 'Unknown',
    ordersCompleted: r._count._all,
    revenueYtd: round2(Number(r._sum.grandTotal ?? 0)),
  }));
}

/* ─── Summary endpoint ──────────────────────────────────────────────────── */
export async function getSummary(actor: Actor, visibleUserIds: string[] | null) {
  const [agg, upcoming] = await Promise.all([
    globalAggregates(visibleUserIds),
    upcomingActivities(visibleUserIds),
  ]);

  const base = {
    role: actor.role,
    counts: {
      leads: agg.leads.total,
      leadsWon: agg.leads.won,
      opportunities: agg.opportunities.total,
      opportunitiesWon: agg.opportunities.won,
      quotations: agg.quotations.total,
      quotationsApproved: agg.quotations.approved,
      orders: agg.orders.total,
      ordersCompleted: agg.orders.completed,
      newCustomers: agg.newCustomers,
    },
    revenueYtd: round2(agg.revenueYtd),
    upcomingActivities: upcoming,
  };

  if (actor.role === Role.ADMIN || actor.role === Role.MANAGER) {
    const [performers] = await Promise.all([topPerformers(visibleUserIds)]);
    return {
      ...base,
      teamAggs: {
        teamSize: visibleUserIds === null ? null : visibleUserIds.length,
        topPerformers: performers,
      },
    };
  }

  return base;
}

/* ─── Team performance table (Manager sees own team; Admin sees all grouped by manager) ─── */
export async function getTeamPerformance(actor: Actor, visibleUserIds: string[] | null) {
  if (actor.role === Role.MARKETING) {
    throw Object.assign(new Error('Marketing users cannot access team performance'), {
      code: 'FORBIDDEN', status: 403,
    });
  }

  let reportUserIds: string[];
  if (actor.role === Role.MANAGER) {
    reportUserIds = visibleUserIds ?? [actor.id];
  } else {
    const all = await prisma.user.findMany({
      where: { deletedAt: null, role: { in: [Role.MANAGER, Role.MARKETING] } },
      select: { id: true },
    });
    reportUserIds = all.map((u) => u.id);
  }

  const users = await loadUsersByIds(reportUserIds);
  // Pass null so we group-by across all users, then look up the ones we report on.
  const kpis = await perUserKpis(null);

  type Member = (typeof users)[number];
  const buildRows = (list: Member[]) => list.map((u) => {
    const k = kpis[u.id] ?? {
      leads: 0, opportunities: 0, quotationsWon: 0,
      quotationsApprovedRevenue: 0, ordersCompleted: 0,
      revenueYtd: 0, newCustomers: 0,
    };
    const conversionRate = k.leads > 0 ? round2((k.quotationsWon / k.leads) * 100) : 0;
    const target = u.role === Role.MARKETING ? 100000 : 250000;
    const achievementPct = target > 0 ? round2((k.revenueYtd / target) * 100) : 0;

    return {
      userId: u.id,
      userName: u.name,
      userEmail: u.email,
      role: u.role,
      leads: k.leads,
      opportunities: k.opportunities,
      quotationsApproved: k.quotationsWon,
      ordersCompleted: k.ordersCompleted,
      newCustomers: k.newCustomers,
      revenueYtd: round2(k.revenueYtd),
      target,
      achievementPct,
      conversionRate,
    };
  });

  if (actor.role === Role.ADMIN) {
    const usersById = new Map(users.map((u) => [u.id, u]));
    const managers = users.filter((u) => u.role === Role.MANAGER);
    const byManager: Record<string, Member[]> = {};
    const orphan: Member[] = [];

    users.forEach((u) => {
      if (u.role === Role.MANAGER) return; // managers listed as headers, not member twice
      if (u.managerId && usersById.has(u.managerId)) {
        (byManager[u.managerId] ??= []).push(u);
      } else {
        orphan.push(u);
      }
    });

    const managerGroups = managers.map((mgr) => {
      const members = [mgr, ...(byManager[mgr.id] ?? [])];
      return {
        managerId: mgr.id,
        managerName: mgr.name,
        members: buildRows(members),
      };
    });

    return {
      grouped: true as const,
      managerGroups,
      orphanMembers: buildRows(orphan),
    };
  }

  // Manager sees flat team list
  return {
    grouped: false as const,
    rows: buildRows(users),
  };
}

