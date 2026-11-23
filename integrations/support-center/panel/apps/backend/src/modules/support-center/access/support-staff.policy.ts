import type { Prisma } from '@prisma/client';

export function supportAccessStaffWhere(id: number): Prisma.UserWhereInput {
  return {
    id,
    isActive: true,
    AND: ['support:read', 'support:access'].map((name) => ({
      roles: { some: { role: { permissions: { some: { name } } } } },
    })),
  };
}
