import { z } from 'zod';
import {
  SurveyStatus, Role, UserStatus,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ownerFilter } from '../../lib/rbac';
import { applyListQuery, buildMeta } from '../../lib/list-query';

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */
export const createSurveySchema = z.object({
  customerId:           z.string().uuid().optional().nullable(),
  leadId:               z.string().uuid().optional().nullable(),
  opportunityId:        z.string().uuid('Invalid opportunityId'),
  location:             z.string().min(1, 'Location is required').max(300),
  requirement:          z.string().min(1, 'Requirement is required').max(2000),
  serviceId:            z.string().uuid().optional().nullable(),
  productId:            z.string().uuid().optional().nullable(),
  technicalRequirement: z.string().max(2000).optional().nullable(),
  quantity:             z.number().int().positive().optional().nullable(),
  budget:               z.number().positive().optional().nullable(),
  surveyDate:           z.string().date('surveyDate must be YYYY-MM-DD'),
  assignedPersonId:     z.string().uuid().optional().nullable(),
  result:               z.string().max(2000).optional().nullable(),
  notes:                z.string().max(2000).optional().nullable(),
  attachments:          z.record(z.string(), z.unknown()).optional().nullable(),
  status:               z.nativeEnum(SurveyStatus).default(SurveyStatus.PENDING),
});

export const updateSurveySchema = createSurveySchema.partial().strict();

/* ─── Actor context ───────────────────────────────────────────────────────── */
export interface Actor {
  id: string;
  role: Role;
  managerId?: string | null;
}

/* ─── Select shape ────────────────────────────────────────────────────────── */
const SURVEY_SELECT = {
  id: true, location: true, requirement: true, technicalRequirement: true,
  quantity: true, budget: true, surveyDate: true, assignedPersonId: true,
  result: true, notes: true, attachments: true, status: true,
  createdAt: true, updatedAt: true,
  customerId: true, leadId: true, opportunityId: true, serviceId: true, productId: true,
  customer:    { select: { id: true, companyName: true, contactPerson: true } },
  lead:        { select: { id: true, leadName: true, companyName: true } },
  opportunity: { select: { id: true, name: true, stage: true } },
  service:     { select: { id: true, name: true } },
  product:     { select: { id: true, name: true } },
  assignedPerson: { select: { id: true, name: true, email: true, role: true } },
} as const;

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function notFound(): never {
  throw Object.assign(new Error('Survey not found'), { code: 'NOT_FOUND', status: 404 });
}

function scopedWhere(
  visibleUserIds: string[] | null,
  extra: Prisma.SurveyWhereInput = {}
): Prisma.SurveyWhereInput {
  const ownership = ownerFilter('assignedPersonId', visibleUserIds);
  return { AND: [ownership, extra] };
}

async function resolveAssignedPerson(
  input: { assignedPersonId?: string | null },
  actor: Actor
): Promise<string> {
  if (actor.role === 'MARKETING') return actor.id;

  if (actor.role === 'MANAGER') {
    const target = input.assignedPersonId ?? actor.id;
    if (target !== actor.id) {
      const member = await prisma.user.findFirst({
        where: { id: target, managerId: actor.id, deletedAt: null },
      });
      if (!member) throw Object.assign(new Error('Assigned person must be a member of your team'), { code: 'FORBIDDEN', status: 403 });
    }
    return target;
  }

  // ADMIN
  const target = input.assignedPersonId ?? actor.id;
  const u = await prisma.user.findFirst({ where: { id: target, deletedAt: null } });
  if (!u) throw Object.assign(new Error('Assigned person not found'), { code: 'NOT_FOUND', status: 404 });
  return target;
}

async function validateRelatedIds(ids: {
  customerId?: string | null; leadId?: string | null;
  opportunityId?: string | null; serviceId?: string | null; productId?: string | null;
}): Promise<void> {
  const checks: Promise<unknown>[] = [];
  if (ids.customerId) {
    checks.push(
      prisma.customer.findFirst({ where: { id: ids.customerId, deletedAt: null } }).then((c) => {
        if (!c) throw Object.assign(new Error('Customer not found'), { code: 'NOT_FOUND', status: 404 });
      })
    );
  }
  if (ids.leadId) {
    checks.push(
      prisma.lead.findFirst({ where: { id: ids.leadId, deletedAt: null } }).then((l) => {
        if (!l) throw Object.assign(new Error('Lead not found'), { code: 'NOT_FOUND', status: 404 });
      })
    );
  }
  if (ids.opportunityId) {
    checks.push(
      prisma.opportunity.findFirst({ where: { id: ids.opportunityId } }).then((o) => {
        if (!o) throw Object.assign(new Error('Opportunity not found'), { code: 'NOT_FOUND', status: 404 });
      })
    );
  }
  if (ids.serviceId) {
    checks.push(
      prisma.service.findFirst({ where: { id: ids.serviceId, status: UserStatus.ACTIVE } }).then((s) => {
        if (!s) throw Object.assign(new Error('Service not found or inactive'), { code: 'NOT_FOUND', status: 404 });
      })
    );
  }
  if (ids.productId) {
    checks.push(
      prisma.product.findFirst({ where: { id: ids.productId, status: UserStatus.ACTIVE } }).then((p) => {
        if (!p) throw Object.assign(new Error('Product not found or inactive'), { code: 'NOT_FOUND', status: 404 });
      })
    );
  }
  if (checks.length) await Promise.all(checks);
}

/* ─── List ────────────────────────────────────────────────────────────────── */
export async function listSurveys(
  query: Record<string, unknown>,
  visibleUserIds: string[] | null
) {
  const extraWhere: Prisma.SurveyWhereInput = {};
  if (query.status)           extraWhere.status           = query.status as SurveyStatus;
  if (query.assignedPersonId) extraWhere.assignedPersonId = query.assignedPersonId as string;
  if (query.opportunityId)    extraWhere.opportunityId    = query.opportunityId as string;
  if (query.leadId)           extraWhere.leadId           = query.leadId as string;
  if (query.customerId)       extraWhere.customerId       = query.customerId as string;

  if (query.surveyDateFrom || query.surveyDateTo) {
    extraWhere.surveyDate = {};
    if (query.surveyDateFrom) (extraWhere.surveyDate as Prisma.DateTimeFilter).gte = new Date(query.surveyDateFrom as string);
    if (query.surveyDateTo)   (extraWhere.surveyDate as Prisma.DateTimeFilter).lte = new Date(query.surveyDateTo as string);
  }

  const base = scopedWhere(visibleUserIds, extraWhere);
  const { skip, take, where, orderBy, page, limit } =
    applyListQuery<Prisma.SurveyWhereInput>(query, base, ['location', 'requirement', 'notes', 'result']);

  const [rows, total] = await Promise.all([
    prisma.survey.findMany({
      where, orderBy: orderBy as Prisma.SurveyOrderByWithRelationInput[],
      skip, take, select: SURVEY_SELECT,
    }),
    prisma.survey.count({ where }),
  ]);

  return { data: rows, meta: buildMeta(total, page, limit) };
}

/* ─── Get one ─────────────────────────────────────────────────────────────── */
export async function getSurvey(id: string, visibleUserIds: string[] | null) {
  const s = await prisma.survey.findFirst({
    where: { AND: [{ id }, ownerFilter('assignedPersonId', visibleUserIds)] },
    select: SURVEY_SELECT,
  });
  if (!s) notFound();
  return s;
}

/* ─── Create ──────────────────────────────────────────────────────────────── */
export async function createSurvey(raw: unknown, actor: Actor) {
  const input = createSurveySchema.parse(raw);
  await validateRelatedIds({
    customerId: input.customerId, leadId: input.leadId,
    opportunityId: input.opportunityId, serviceId: input.serviceId, productId: input.productId,
  });
  const assignedPersonId = await resolveAssignedPerson(input, actor);

  return prisma.survey.create({
    data: {
      customerId:           input.customerId ?? null,
      leadId:               input.leadId ?? null,
      opportunityId:        input.opportunityId,
      location:             input.location.trim(),
      requirement:          input.requirement.trim(),
      serviceId:            input.serviceId ?? null,
      productId:            input.productId ?? null,
      technicalRequirement: input.technicalRequirement?.trim() ?? null,
      quantity:             input.quantity ?? null,
      budget:               input.budget ?? null,
      surveyDate:           new Date(input.surveyDate),
      assignedPersonId,
      result:               input.result?.trim() ?? null,
      notes:                input.notes?.trim() ?? null,
      attachments:          (input.attachments as Prisma.InputJsonValue) ?? undefined,
      status:               input.status,
    },
    select: SURVEY_SELECT,
  });
}

/* ─── Update ──────────────────────────────────────────────────────────────── */
export async function updateSurvey(
  id: string,
  raw: unknown,
  actor: Actor,
  visibleUserIds: string[] | null
) {
  const existing = await prisma.survey.findFirst({
    where: { AND: [{ id }, ownerFilter('assignedPersonId', visibleUserIds)] },
  });
  if (!existing) notFound();

  const input = updateSurveySchema.parse(raw);
  await validateRelatedIds({
    customerId: input.customerId, leadId: input.leadId,
    opportunityId: input.opportunityId, serviceId: input.serviceId, productId: input.productId,
  });

  if (actor.role === 'MARKETING') {
    if (input.assignedPersonId && input.assignedPersonId !== actor.id) {
      throw Object.assign(new Error('You cannot reassign this survey to another person'), { code: 'FORBIDDEN', status: 403 });
    }
  }

  if (actor.role === 'MANAGER') {
    if (input.assignedPersonId && input.assignedPersonId !== existing.assignedPersonId) {
      const member = await prisma.user.findFirst({
        where: { id: input.assignedPersonId, managerId: actor.id, deletedAt: null },
      });
      if (!member) throw Object.assign(new Error('Assigned person must be a member of your team'), { code: 'FORBIDDEN', status: 403 });
    }
  }

  if (actor.role === 'ADMIN') {
    if (input.assignedPersonId) {
      const u = await prisma.user.findFirst({ where: { id: input.assignedPersonId, deletedAt: null } });
      if (!u) throw Object.assign(new Error('Assigned person not found'), { code: 'NOT_FOUND', status: 404 });
    }
  }

  const data: Prisma.SurveyUncheckedUpdateInput = {};
  if (input.customerId           !== undefined) data.customerId           = input.customerId ?? null;
  if (input.leadId               !== undefined) data.leadId               = input.leadId ?? null;
  if (input.opportunityId        !== undefined) data.opportunityId        = input.opportunityId;
  if (input.location             !== undefined) data.location             = input.location.trim();
  if (input.requirement          !== undefined) data.requirement          = input.requirement.trim();
  if (input.serviceId            !== undefined) data.serviceId            = input.serviceId ?? null;
  if (input.productId            !== undefined) data.productId            = input.productId ?? null;
  if (input.technicalRequirement !== undefined) data.technicalRequirement = input.technicalRequirement?.trim() ?? null;
  if (input.quantity             !== undefined) data.quantity             = input.quantity ?? null;
  if (input.budget               !== undefined) data.budget               = input.budget ?? null;
  if (input.surveyDate           !== undefined) data.surveyDate           = new Date(input.surveyDate);
  if (input.assignedPersonId     !== undefined && input.assignedPersonId !== null) data.assignedPersonId = input.assignedPersonId;
  if (input.result               !== undefined) data.result               = input.result?.trim() ?? null;
  if (input.notes                !== undefined) data.notes                = input.notes?.trim() ?? null;
  if (input.attachments          !== undefined) data.attachments          = (input.attachments as Prisma.InputJsonValue) ?? null;
  if (input.status               !== undefined) data.status               = input.status;

  return prisma.survey.update({ where: { id }, data, select: SURVEY_SELECT });
}
