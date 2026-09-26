import {
  LeadStatus,
  OpportunityStage,
  QuotationStatus,
  Role,
  SalesOrderStatus,
  SurveyStatus,
  ActivityType,
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

function parseDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d;
}

/* ─── Build a scope for sales-orders with all optional filters ─────────── */
function buildSalesWhere(
  visibleUserIds: string[] | null,
  q: Record<string, unknown>
) {
  const dateFrom = parseDate(q.dateFrom);
  const dateTo = parseDate(q.dateTo);
  const where: Record<string, unknown> = {
    ...ownerFilter('marketingPersonId', visibleUserIds),
  };
  if (dateFrom || dateTo) {
    const orderDate: Record<string, Date> = {};
    if (dateFrom) { dateFrom.setHours(0, 0, 0, 0); orderDate.gte = dateFrom; }
    if (dateTo)   { dateTo.setHours(23, 59, 59, 999); orderDate.lte = dateTo; }
    where.orderDate = orderDate;
  }
  if (q.serviceId || q.categoryId || q.productId) {
    where.items = {
      some: {
        ...(q.productId ? { productId: String(q.productId) } : {}),
        ...(q.categoryId || q.serviceId
          ? {
              product: {
                ...(q.categoryId ? { categoryId: String(q.categoryId) } : {}),
                ...(q.serviceId ? { serviceId: String(q.serviceId) } : {}),
              },
            }
          : {}),
      },
    };
  }
  if (q.customerId) where.customerId = String(q.customerId);
  if (q.managerId) where.managerId = String(q.managerId);
  if (q.marketingPersonId) where.marketingPersonId = String(q.marketingPersonId);
  if (q.status) where.status = String(q.status);
  return where;
}

/* ─── Load user lookup helpers (id → user info row) ─────────────────────── */
async function loadUserMap(ids: string[]) {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return new Map<string, { id: string; name: string; email: string; role: Role; managerId?: string | null }>();
  const users = await prisma.user.findMany({
    where: { id: { in: uniq }, deletedAt: null },
    select: { id: true, name: true, email: true, role: true, managerId: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

/* ─── Generic group-by helper for sales orders (reusable) ───────────────── */
type SalesRow = { key: string; label: string; ordersCount: number; itemsCount: number; grandTotal: number; avgOrderValue: number };

/* ─── Public: GET /api/reports/sales ────────────────────────────────────── */
export async function getSalesReport(
  _actor: Actor,
  visibleUserIds: string[] | null,
  query: Record<string, unknown>
) {
  const groupBy = String(query.groupBy ?? 'month');
  const where = buildSalesWhere(visibleUserIds, query);

  const orders = await prisma.salesOrder.findMany({
    where: where as never,
    include: {
      items: { include: { product: { include: { category: { include: { service: true } }, service: true } } } },
      customer: { select: { id: true, companyName: true, contactPerson: true } },
    },
    orderBy: { orderDate: 'asc' },
  });

  const mktIds: string[] = [];
  const mgrIds: string[] = [];
  orders.forEach((o) => {
    if (o.marketingPersonId) mktIds.push(o.marketingPersonId);
    if (o.managerId) mgrIds.push(o.managerId);
  });
  const userMap = await loadUserMap([...mktIds, ...mgrIds]);

  // Flatten items-level rows for finer-grained groupings
  const flat = orders.flatMap((o) =>
    o.items.map((it) => ({
      orderId: o.id,
      orderDate: o.orderDate,
      marketingPersonId: o.marketingPersonId,
      managerId: o.managerId,
      customerId: o.customerId,
      customerName: o.customer.companyName ?? o.customer.contactPerson,
      grandTotal: Number(o.grandTotal),
      qty: it.quantity,
      lineTotal: Number(it.lineTotal),
      productId: it.productId,
      productName: it.product.name,
      categoryId: it.product.categoryId,
      categoryName: it.product.category?.name ?? '',
      serviceId: it.product.serviceId,
      serviceName: it.product.category?.service?.name ?? it.product.service?.name ?? '',
      status: o.status,
    }))
  );

  const rows: SalesRow[] = [];

  if (groupBy === 'product') {
    const map = new Map<string, { ids: Set<string>; qty: number; total: number; label: string }>();
    flat.forEach((r) => {
      const cur = map.get(r.productId) ?? { ids: new Set<string>(), qty: 0, total: 0, label: r.productName };
      cur.ids.add(r.orderId);
      cur.qty += r.qty;
      cur.total += r.lineTotal;
      map.set(r.productId, cur);
    });
    map.forEach((v, k) => rows.push({
      key: k, label: v.label,
      ordersCount: v.ids.size,
      itemsCount: v.qty,
      grandTotal: round2(v.total),
      avgOrderValue: v.ids.size ? round2(v.total / v.ids.size) : 0,
    }));
  } else if (groupBy === 'category') {
    const map = new Map<string, { ids: Set<string>; qty: number; total: number; label: string }>();
    flat.forEach((r) => {
      const k = r.categoryId ?? 'none';
      const cur = map.get(k) ?? { ids: new Set<string>(), qty: 0, total: 0, label: r.categoryName || 'Uncategorized' };
      cur.ids.add(r.orderId);
      cur.qty += r.qty;
      cur.total += r.lineTotal;
      map.set(k, cur);
    });
    map.forEach((v, k) => rows.push({
      key: k, label: v.label,
      ordersCount: v.ids.size,
      itemsCount: v.qty,
      grandTotal: round2(v.total),
      avgOrderValue: v.ids.size ? round2(v.total / v.ids.size) : 0,
    }));
  } else if (groupBy === 'service') {
    const map = new Map<string, { ids: Set<string>; qty: number; total: number; label: string }>();
    flat.forEach((r) => {
      const k = r.serviceId ?? 'none';
      const cur = map.get(k) ?? { ids: new Set<string>(), qty: 0, total: 0, label: r.serviceName || 'No Service' };
      cur.ids.add(r.orderId);
      cur.qty += r.qty;
      cur.total += r.lineTotal;
      map.set(k, cur);
    });
    map.forEach((v, k) => rows.push({
      key: k, label: v.label,
      ordersCount: v.ids.size,
      itemsCount: v.qty,
      grandTotal: round2(v.total),
      avgOrderValue: v.ids.size ? round2(v.total / v.ids.size) : 0,
    }));
  } else if (groupBy === 'person') {
    const map = new Map<string, { ids: Set<string>; qty: number; total: number; label: string }>();
    flat.forEach((r) => {
      const k = r.marketingPersonId;
      const cur = map.get(k) ?? { ids: new Set<string>(), qty: 0, total: 0, label: userMap.get(k)?.name ?? 'Unknown' };
      cur.ids.add(r.orderId);
      cur.qty += r.qty;
      cur.total += r.lineTotal;
      map.set(k, cur);
    });
    map.forEach((v, k) => rows.push({
      key: k, label: v.label,
      ordersCount: v.ids.size,
      itemsCount: v.qty,
      grandTotal: round2(v.total),
      avgOrderValue: v.ids.size ? round2(v.total / v.ids.size) : 0,
    }));
  } else if (groupBy === 'manager') {
    const map = new Map<string, { ids: Set<string>; qty: number; total: number; label: string }>();
    flat.forEach((r) => {
      const k = r.managerId;
      const cur = map.get(k) ?? { ids: new Set<string>(), qty: 0, total: 0, label: userMap.get(k)?.name ?? 'Unknown' };
      cur.ids.add(r.orderId);
      cur.qty += r.qty;
      cur.total += r.lineTotal;
      map.set(k, cur);
    });
    map.forEach((v, k) => rows.push({
      key: k, label: v.label,
      ordersCount: v.ids.size,
      itemsCount: v.qty,
      grandTotal: round2(v.total),
      avgOrderValue: v.ids.size ? round2(v.total / v.ids.size) : 0,
    }));
  } else if (groupBy === 'customer') {
    const map = new Map<string, { ids: Set<string>; qty: number; total: number; label: string }>();
    flat.forEach((r) => {
      const k = r.customerId;
      const cur = map.get(k) ?? { ids: new Set<string>(), qty: 0, total: 0, label: r.customerName };
      cur.ids.add(r.orderId);
      cur.qty += r.qty;
      cur.total += r.lineTotal;
      map.set(k, cur);
    });
    map.forEach((v, k) => rows.push({
      key: k, label: v.label,
      ordersCount: v.ids.size,
      itemsCount: v.qty,
      grandTotal: round2(v.total),
      avgOrderValue: v.ids.size ? round2(v.total / v.ids.size) : 0,
    }));
  } else {
    // default: group by month (YYYY-MM)
    const map = new Map<string, { ids: Set<string>; qty: number; total: number; label: string }>();
    flat.forEach((r) => {
      const d = new Date(r.orderDate);
      const yyyyMm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cur = map.get(yyyyMm) ?? { ids: new Set<string>(), qty: 0, total: 0, label: yyyyMm };
      cur.ids.add(r.orderId);
      cur.qty += r.qty;
      cur.total += r.lineTotal;
      map.set(yyyyMm, cur);
    });
    const monthsSorted = Array.from(map.keys()).sort();
    monthsSorted.forEach((m) => {
      const v = map.get(m)!;
      rows.push({
        key: m, label: v.label,
        ordersCount: v.ids.size,
        itemsCount: v.qty,
        grandTotal: round2(v.total),
        avgOrderValue: v.ids.size ? round2(v.total / v.ids.size) : 0,
      });
    });
    return {
      groupBy,
      rows,
      totals: {
        ordersTotal: orders.length,
        itemsTotal: flat.reduce((s, r) => s + r.qty, 0),
        revenueTotal: round2(flat.reduce((s, r) => s + r.lineTotal, 0)),
      },
    };
  }

  rows.sort((a, b) => b.grandTotal - a.grandTotal);
  return {
    groupBy,
    rows,
    totals: {
      ordersTotal: orders.length,
      itemsTotal: flat.reduce((s, r) => s + r.qty, 0),
      revenueTotal: round2(flat.reduce((s, r) => s + r.lineTotal, 0)),
    },
  };
}

/* ─── Public: GET /api/reports/marketing ────────────────────────────────── */
export async function getMarketingReport(
  _actor: Actor,
  visibleUserIds: string[] | null,
  _query: Record<string, unknown>
) {
  const scopeMP = ownerFilter('marketingPersonId', visibleUserIds);
  const scopeAU = ownerFilter('assignedUserId', visibleUserIds);
  const scopeAP = ownerFilter('assignedPersonId', visibleUserIds);

  const dateFrom = parseDate(_query.dateFrom);
  const dateTo = parseDate(_query.dateTo);
  const createdAtWindow: Record<string, Date> = {};
  if (dateFrom) { dateFrom.setHours(0,0,0,0); createdAtWindow.gte = dateFrom; }
  if (dateTo)   { dateTo.setHours(23,59,59,999); createdAtWindow.lte = dateTo; }
  const dateWindowSet = dateFrom || dateTo;

  const leadsWhere = { ...scopeMP, deletedAt: null, ...(dateWindowSet ? { createdAt: createdAtWindow } : {}) };
  const oppsWhere  = { ...scopeMP, ...(dateWindowSet ? { createdAt: createdAtWindow } : {}) };
  const actsWhere  = { ...scopeAU, ...(dateWindowSet ? { activityDate: createdAtWindow } : {}) };
  const survsWhere = { ...scopeAP, ...(dateWindowSet ? { surveyDate: createdAtWindow } : {}) };

  /* ── 1. Lead counts by status (pipeline) ─────────────────────────────── */
  const leadsByStatusGroup = await prisma.lead.groupBy({
    by: ['status'],
    where: leadsWhere as never,
    _count: { _all: true },
  });
  const leadsByStatus: Record<string, number> = {};
  (Object.values(LeadStatus) as string[]).forEach((s) => { leadsByStatus[s] = 0; });
  leadsByStatusGroup.forEach((r) => { leadsByStatus[r.status as string] = r._count._all; });
  const leadsTotal = leadsByStatusGroup.reduce((s, r) => s + r._count._all, 0);

  /* ── 2. Opportunity stages (pipeline) ────────────────────────────────── */
  const oppsByStageGroup = await prisma.opportunity.groupBy({
    by: ['stage'],
    where: oppsWhere as never,
    _count: { _all: true },
    _sum: { estimatedValue: true },
  });
  const oppsByStage: Record<string, { count: number; value: number }> = {};
  (Object.values(OpportunityStage) as string[]).forEach((s) => { oppsByStage[s] = { count: 0, value: 0 }; });
  oppsByStageGroup.forEach((r) => {
    oppsByStage[r.stage as string] = {
      count: r._count._all,
      value: round2(Number(r._sum.estimatedValue ?? 0)),
    };
  });
  const oppsTotal = oppsByStageGroup.reduce((s, r) => s + r._count._all, 0);
  const oppsPipelineValue = round2(oppsByStageGroup.reduce((s, r) => s + Number(r._sum.estimatedValue ?? 0), 0));

  /* ── 3. Lead conversion rates ────────────────────────────────────────── */
  const [wonLeads, qualifiedLeads] = await Promise.all([
    prisma.lead.count({ where: { ...leadsWhere, status: LeadStatus.WON } as never }),
    prisma.lead.count({ where: { ...leadsWhere, status: LeadStatus.QUALIFIED } as never }),
  ]);
  const conversionRates = {
    leadsToQualified: leadsTotal > 0 ? round2(((wonLeads + qualifiedLeads) / leadsTotal) * 100) : 0,
    leadsToWon:       leadsTotal > 0 ? round2((wonLeads / leadsTotal) * 100) : 0,
    qualifiedToWon:   qualifiedLeads > 0 ? round2((wonLeads / qualifiedLeads) * 100) : 0,
  };

  /* ── 4. Funnel: NEW → QUALIFIED → QUOTATION → WON ───────────────────── */
  const [newLeads, proposals, quotationsApproved, ordersCompleted, newCustomers] = await Promise.all([
    prisma.lead.count({ where: { ...leadsWhere, status: LeadStatus.NEW } as never }),
    prisma.lead.count({ where: { ...leadsWhere, status: LeadStatus.PROPOSAL } as never }),
    prisma.quotation.count({ where: { ...scopeMP, status: { in: [QuotationStatus.APPROVED, QuotationStatus.CONVERTED] }, ...(dateWindowSet ? { quotationDate: createdAtWindow } : {}) } as never }),
    prisma.salesOrder.count({ where: { ...scopeMP, status: SalesOrderStatus.COMPLETED, ...(dateWindowSet ? { orderDate: createdAtWindow } : {}) } as never }),
    prisma.customer.count({ where: { ...scopeMP, deletedAt: null, ...(dateWindowSet ? { createdAt: createdAtWindow } : {}) } as never }),
  ]);
  const funnel = [
    { stage: 'New Leads',        value: newLeads },
    { stage: 'Qualified',        value: leadsTotal - newLeads > 0 ? qualifiedLeads : 0 },
    { stage: 'Proposal/Quotes',  value: proposals + quotationsApproved },
    { stage: 'Approved Quotes',  value: quotationsApproved },
    { stage: 'Won / Completed Orders', value: ordersCompleted },
    { stage: 'New Customers',    value: newCustomers },
  ];

  /* ── 5. Activities by type (follow-ups, calls, meetings, etc) ────────── */
  const actsByType = await prisma.activity.groupBy({
    by: ['type'],
    where: actsWhere as never,
    _count: { _all: true },
  });
  const activitiesByType: Record<string, number> = {};
  (Object.values(ActivityType) as string[]).forEach((t) => { activitiesByType[t] = 0; });
  actsByType.forEach((r) => { activitiesByType[r.type as string] = r._count._all; });

  /* ── 6. Surveys report ───────────────────────────────────────────────── */
  const surveysByStatusGroup = await prisma.survey.groupBy({
    by: ['status'],
    where: survsWhere as never,
    _count: { _all: true },
  });
  const surveysByStatus: Record<string, number> = {};
  (Object.values(SurveyStatus) as string[]).forEach((s) => { surveysByStatus[s] = 0; });
  surveysByStatusGroup.forEach((r) => { surveysByStatus[r.status as string] = r._count._all; });
  const surveysTotal = surveysByStatusGroup.reduce((s, r) => s + r._count._all, 0);
  const surveysCompleted = surveysByStatus[SurveyStatus.COMPLETED as string] ?? 0;

  return {
    dateRange: {
      from: dateFrom ? dateFrom.toISOString().slice(0, 10) : null,
      to:   dateTo   ? dateTo.toISOString().slice(0, 10)   : null,
    },
    leads: {
      total: leadsTotal,
      byStatus: leadsByStatus,
      won: wonLeads,
    },
    opportunities: {
      total: oppsTotal,
      pipelineValue: oppsPipelineValue,
      byStage: oppsByStage,
    },
    conversionRates,
    funnel,
    activities: {
      total: actsByType.reduce((s, r) => s + r._count._all, 0),
      byType: activitiesByType,
      followUps: activitiesByType[ActivityType.FOLLOW_UP as string] ?? 0,
      calls:    activitiesByType[ActivityType.CALL as string] ?? 0,
      meetings: activitiesByType[ActivityType.MEETING as string] ?? 0,
    },
    surveys: {
      total: surveysTotal,
      completed: surveysCompleted,
      completionRate: surveysTotal ? round2((surveysCompleted / surveysTotal) * 100) : 0,
      byStatus: surveysByStatus,
    },
  };
}

