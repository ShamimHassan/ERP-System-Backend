import bcrypt from 'bcrypt';
import { z } from 'zod';
import { env } from '../../config/env';
import {
  signAccessToken,
  signTokenPair,
  verifyRefreshToken,
  type JwtUserPayload,
} from '../../config/jwt';
import { prisma } from '../../lib/prisma';
import { UserStatus, type Role } from '@prisma/client';

const revokedRefreshTokens = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [tok, exp] of revokedRefreshTokens.entries()) {
    if (exp < now) revokedRefreshTokens.delete(tok);
  }
}, 60_000);

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(100),
});

export interface LoginResult {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    managerId: string | null;
    status: UserStatus;
    createdAt: Date;
  };
  accessToken: string;
  refreshToken: string;
}

export async function login(raw: unknown): Promise<LoginResult> {
  const input = loginSchema.parse(raw);
  const user = await prisma.user.findUnique({
    where: { email: input.email.trim().toLowerCase() },
  });

  if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
    throw Object.assign(new Error('Invalid email or password'), {
      code: 'INVALID_CREDENTIALS',
      status: 401,
    });
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    throw Object.assign(new Error('Invalid email or password'), {
      code: 'INVALID_CREDENTIALS',
      status: 401,
    });
  }

  const payload: JwtUserPayload = {
    id: user.id,
    role: user.role as JwtUserPayload['role'],
    managerId: user.managerId ?? null,
  };
  const tokens = signTokenPair(payload);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      managerId: user.managerId ?? null,
      status: user.status,
      createdAt: user.createdAt,
    },
    ...tokens,
  };
}

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export async function refreshToken(raw: unknown) {
  const input = refreshSchema.parse(raw);
  if (revokedRefreshTokens.has(input.refreshToken)) {
    throw Object.assign(new Error('Refresh token has been revoked'), {
      code: 'REVOKED_TOKEN',
      status: 401,
    });
  }

  let payload: JwtUserPayload;
  try {
    payload = verifyRefreshToken(input.refreshToken);
  } catch (err) {
    throw Object.assign(new Error('Invalid or expired refresh token'), {
      code: 'INVALID_REFRESH_TOKEN',
      status: 401,
    });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
    throw Object.assign(new Error('User no longer exists or is inactive'), {
      code: 'USER_INACTIVE',
      status: 401,
    });
  }

  const freshPayload: JwtUserPayload = {
    id: user.id,
    role: user.role as JwtUserPayload['role'],
    managerId: user.managerId ?? null,
  };

  return { accessToken: signAccessToken(freshPayload) };
}

export async function logout(userId: string, refreshToken?: string) {
  if (refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const expMs = (decoded as unknown as { exp: number }).exp * 1000;
      revokedRefreshTokens.set(refreshToken, expMs);
    } catch {
      /* ignore invalid tokens */
    }
  }
  return { userId, loggedOut: true };
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      managerId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      manager: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (!user) {
    throw Object.assign(new Error('User not found'), {
      code: 'NOT_FOUND',
      status: 404,
    });
  }
  return user;
}

export async function changePassword(
  userId: string,
  raw: unknown
): Promise<{ changed: boolean }> {
  const input = changePasswordSchema.parse(raw);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw Object.assign(new Error('User not found'), {
      code: 'NOT_FOUND',
      status: 404,
    });
  }
  const matches = await bcrypt.compare(input.oldPassword, user.passwordHash);
  if (!matches) {
    throw Object.assign(new Error('Old password is incorrect'), {
      code: 'INVALID_OLD_PASSWORD',
      status: 400,
    });
  }
  const passwordHash = await bcrypt.hash(input.newPassword, env.BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { changed: true };
}

export async function ensureDemoAdmin(): Promise<void> {
  const email = 'admin@erp.com';
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return;
  const password = 'Admin@123';
  const hash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'System Admin',
      email,
      passwordHash: hash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  console.info('[auth] Demo admin created: admin@erp.com / Admin@123');
}
