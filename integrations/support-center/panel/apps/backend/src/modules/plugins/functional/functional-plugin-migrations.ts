import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { supportCenterManagedRolesMigration } from '@/plugins/support-center/migrations/002-managed-roles';
import { supportCenterWorkflowMigration } from '@/plugins/support-center/migrations/003-workflow';
import { supportCenterReliabilityMigration } from '@/plugins/support-center/migrations/004-reliability';

export async function applySupportReliabilityMigration(
  tx: Prisma.TransactionClient,
) {
  const checksum = createHash('sha256')
    .update(supportCenterReliabilityMigration.join('\n'))
    .digest('hex');
  const applied = await tx.$queryRaw<
    Array<{ checksum: string }>
  >`SELECT checksum FROM plugin_support_center.migrations WHERE id='004_reliability'`;
  if (applied.length && applied[0].checksum !== checksum)
    throw new ConflictException('PLUGIN_MIGRATION_CHANGED');
  if (!applied.length) {
    for (const sql of supportCenterReliabilityMigration)
      await tx.$executeRawUnsafe(sql);
    await tx.$executeRaw`INSERT INTO plugin_support_center.migrations(id,checksum) VALUES ('004_reliability',${checksum})`;
  }
}

export async function applyManagedRoleMigration(tx: Prisma.TransactionClient) {
  const checksum = createHash('sha256')
    .update(supportCenterManagedRolesMigration.join('\n'))
    .digest('hex');
  const applied = await tx.$queryRaw<
    Array<{ checksum: string }>
  >`SELECT checksum FROM plugin_support_center.migrations WHERE id = '002_managed_roles'`;
  if (applied.length && applied[0].checksum !== checksum)
    throw new ConflictException('PLUGIN_MIGRATION_CHANGED');
  if (!applied.length) {
    for (const sql of supportCenterManagedRolesMigration)
      await tx.$executeRawUnsafe(sql);
    await tx.$executeRaw`INSERT INTO plugin_support_center.migrations (id, checksum) VALUES ('002_managed_roles', ${checksum})`;
  }
}

export async function applySupportWorkflowMigration(
  tx: Prisma.TransactionClient,
) {
  const checksum = createHash('sha256')
    .update(supportCenterWorkflowMigration.join('\n'))
    .digest('hex');
  const applied = await tx.$queryRaw<
    Array<{ checksum: string }>
  >`SELECT checksum FROM plugin_support_center.migrations WHERE id = '003_workflow'`;
  if (applied.length && applied[0].checksum !== checksum)
    throw new ConflictException('PLUGIN_MIGRATION_CHANGED');
  if (!applied.length) {
    for (const sql of supportCenterWorkflowMigration)
      await tx.$executeRawUnsafe(sql);
    await tx.$executeRaw`INSERT INTO plugin_support_center.migrations (id, checksum) VALUES ('003_workflow', ${checksum})`;
  }
}
