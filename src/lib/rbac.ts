import type { Role } from '@prisma/client';
import { prisma } from './prisma';

export interface ScopedUser {
  id: string;
  role: Role;
  managerId?: string | null;
}

export async function getVisibleUserIds(
  user: ScopedUser
): Promise<string[] | null> {
  if (user.role === 'ADMIN') return null;
  if (user.role === 'MANAGER') {
    const team = await prisma.user.findMany({
      where: { managerId: user.id, deletedAt: null },
      select: { id: true },
    });
    return [user.id, ...team.map((t) => t.id)];
  }
  return [user.id];
}

export function ownerFilter<K extends string>(
  field: K,
  ids: string[] | null
): Record<K, { in: string[] }> | Record<string, never> {
  if (ids === null) return {} as Record<string, never>;
  return { [field]: { in: ids } } as Record<K, { in: string[] }>;
}
