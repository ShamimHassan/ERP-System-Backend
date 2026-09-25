import bcrypt from 'bcrypt';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { Role, UserStatus, type User, type Prisma } from '@prisma/client';

const ROLE_VALUES: [string, ...string[]] = Object.values(Role) as [
  string,
  ...string[]
];
const STATUS_VALUES: [string, ...string[]] = Object.values(UserStatus) as [
  string,
  ...string[]
];

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email format').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100),
  role: z.enum(ROLE_VALUES as [Role, ...Role[]]).default(Role.MARKETING),
  status: z
    .enum(STATUS_VALUES as [UserStatus, ...UserStatus[]])
    .default(UserStatus.ACTIVE),
  managerId: z.string().uuid('Invalid managerId').optional().nullable(),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().max(255).optional(),
    password: z.string().min(8).max(100).optional(),
    role: z.enum(ROLE_VALUES as [Role, ...Role[]]).optional(),
    status: z
      .enum(STATUS_VALUES as [UserStatus, ...UserStatus[]])
      .optional(),
    managerId: z
      .string()
      .uuid()
      .nullable()
      .optional(),
  })
  .strict();

export interface UserResult
  extends Pick<
    User,
    | 'id'
    | 'name'
    | 'email'
    | 'role'
    | 'managerId'
    | 'status'
    | 'createdAt'
    | 'updatedAt'
  > {
  manager?: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
}

export interface UserListResult {
  data: UserResult[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  managerId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  manager: {
    select: { id: true, name: true, email: true, role: true },
  },
} as const;

function mapResult(u: {
  id: string;
  name: string;
  email: string;
  role: Role;
  managerId: string | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  manager: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
}): UserResult {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    managerId: u.managerId,
    status: u.status,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    manager: u.manager,
  };
}

interface ListParams {
  page?: string | number;
  limit?: string | number;
  sort?: string;
  search?: string;
  status?: string;
  visibleUserIds: string[] | null;
}

export async function listUsers(params: ListParams): Promise<UserListResult> {
  const { skip, take, orderBy, where, page, limit } = (
    await import('../../lib/list-query')
  ).applyListQuery(
    { page: params.page, limit: params.limit, sort: params.sort, search: params.search, status: params.status },
    params.visibleUserIds === null
      ? ({ deletedAt: null } as object)
      : ({ id: { in: params.visibleUserIds }, deletedAt: null } as object),
    ['name', 'email']
  );

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      skip,
      take,
      select: USER_SELECT,
    }),
    prisma.user.count({ where }),
  ]);

  const { buildMeta } = await import('../../lib/list-query');
  return {
    data: rows.map(mapResult),
    meta: buildMeta(total, page, limit),
  };
}

export async function getUser(
  id: string,
  visibleUserIds: string[] | null
): Promise<UserResult> {
  const where: Prisma.UserWhereInput = { AND: [{ id }, { deletedAt: null }] };
  if (visibleUserIds !== null) {
    where.AND = [...(where.AND as Prisma.UserWhereInput[]), { id: { in: visibleUserIds } }];
  }
  const user = await prisma.user.findFirst({
    where,
    select: USER_SELECT,
  });
  if (!user) {
    throw Object.assign(new Error('User not found'), {
      code: 'NOT_FOUND',
      status: 404,
    });
  }
  return mapResult(user);
}

export interface ActorContext {
  id: string;
  role: Role;
}

export async function createUser(
  raw: unknown,
  actor: ActorContext
): Promise<UserResult> {
  if (actor.role !== 'ADMIN') {
    throw Object.assign(
      new Error('Only administrators can create new users'),
      { code: 'FORBIDDEN', status: 403 }
    );
  }
  const input = createUserSchema.parse(raw);

  const existing = await prisma.user.findUnique({
    where: { email: input.email.trim().toLowerCase() },
  });
  if (existing) {
    throw Object.assign(new Error('A user with this email already exists'), {
      code: 'CONFLICT',
      status: 409,
    });
  }

  if (input.managerId) {
    const manager = await prisma.user.findFirst({
      where: { id: input.managerId, deletedAt: null, status: UserStatus.ACTIVE },
    });
    if (!manager || (manager.role !== 'ADMIN' && manager.role !== 'MANAGER')) {
      throw Object.assign(new Error('Invalid manager selected'), {
        code: 'BAD_REQUEST',
        status: 400,
      });
    }
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const created = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash,
      role: input.role,
      status: input.status,
      managerId: input.managerId ?? null,
    },
    select: USER_SELECT,
  });
  return mapResult(created);
}

export async function updateUser(
  id: string,
  raw: unknown,
  actor: ActorContext,
  visibleUserIds: string[] | null
): Promise<UserResult> {
  const where: Prisma.UserWhereInput = { AND: [{ id }, { deletedAt: null }] };
  if (visibleUserIds !== null) {
    where.AND = [...(where.AND as Prisma.UserWhereInput[]), { id: { in: visibleUserIds } }];
  }
  const existing = await prisma.user.findFirst({ where });
  if (!existing) {
    throw Object.assign(new Error('User not found'), {
      code: 'NOT_FOUND',
      status: 404,
    });
  }

  const input = updateUserSchema.parse(raw);
  const data: Record<string, unknown> = {};

  if (actor.role === 'ADMIN') {
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      const dup = await prisma.user.findUnique({ where: { email } });
      if (dup && dup.id !== id) {
        throw Object.assign(new Error('Email already in use by another user'), {
          code: 'CONFLICT',
          status: 409,
        });
      }
      data.email = email;
    }
    if (input.password !== undefined) {
      data.passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
    }
    if (input.role !== undefined) data.role = input.role;
    if (input.status !== undefined) data.status = input.status;
    if (input.managerId !== undefined) {
      if (input.managerId === null) {
        data.managerId = null;
      } else {
        const mgr = await prisma.user.findFirst({
          where: { id: input.managerId, deletedAt: null, status: UserStatus.ACTIVE },
        });
        if (!mgr || (mgr.role !== 'ADMIN' && mgr.role !== 'MANAGER')) {
          throw Object.assign(new Error('Invalid manager selected'), {
            code: 'BAD_REQUEST',
            status: 400,
          });
        }
        if (mgr.id === id) {
          throw Object.assign(new Error('A user cannot manage themselves'), {
            code: 'BAD_REQUEST',
            status: 400,
          });
        }
        data.managerId = mgr.id;
      }
    }
  } else if (actor.role === 'MANAGER') {
    const allowedKeys = new Set<keyof typeof input>(['managerId']);
    for (const key of Object.keys(input) as (keyof typeof input)[]) {
      if (!allowedKeys.has(key)) {
        throw Object.assign(
          new Error('Managers may only change the manager assignment'),
          { code: 'FORBIDDEN', status: 403 }
        );
      }
    }
    if (existing.role !== Role.MARKETING) {
      throw Object.assign(
        new Error('Managers may only assign Marketing team members'),
        { code: 'FORBIDDEN', status: 403 }
      );
    }
    if (input.managerId !== undefined) {
      if (input.managerId === null) {
        throw Object.assign(
          new Error('Managers cannot remove the manager assignment'),
          { code: 'FORBIDDEN', status: 403 }
        );
      }
      if (input.managerId !== actor.id) {
        throw Object.assign(
          new Error('Managers may only assign marketing users to themselves'),
          { code: 'FORBIDDEN', status: 403 }
        );
      }
      data.managerId = actor.id;
    }
  } else {
    throw Object.assign(new Error('You are not allowed to update users'), {
      code: 'FORBIDDEN',
      status: 403,
    });
  }

  if (Object.keys(data).length === 0) {
    return getUser(id, visibleUserIds);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: USER_SELECT,
  });
  return mapResult(updated);
}

export async function deleteUser(
  id: string,
  actor: ActorContext,
  visibleUserIds: string[] | null
): Promise<{ id: string; deleted: boolean }> {
  if (actor.role !== 'ADMIN') {
    throw Object.assign(
      new Error('Only administrators can delete users'),
      { code: 'FORBIDDEN', status: 403 }
    );
  }
  const where: Prisma.UserWhereInput = { AND: [{ id }, { deletedAt: null }] };
  if (visibleUserIds !== null) {
    where.AND = [...(where.AND as Prisma.UserWhereInput[]), { id: { in: visibleUserIds } }];
  }
  const existing = await prisma.user.findFirst({ where });
  if (!existing) {
    throw Object.assign(new Error('User not found'), {
      code: 'NOT_FOUND',
      status: 404,
    });
  }
  if (existing.id === actor.id) {
    throw Object.assign(new Error('You cannot delete your own account'), {
      code: 'BAD_REQUEST',
      status: 400,
    });
  }
  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), status: UserStatus.INACTIVE },
  });
  return { id, deleted: true };
}
