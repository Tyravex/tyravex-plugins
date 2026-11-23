import type { Prisma } from '@prisma/client';
import type { FunctionalPluginManifest } from '@shared/types';
import { ConflictException } from '@nestjs/common';

/** Templates never overwrite an administrator's roles or assign accounts. */
export async function registerPluginRoleTemplates(tx: Prisma.TransactionClient, manifest: FunctionalPluginManifest) {
  for (const template of manifest.roleTemplates ?? []) {
    if (template.permissions.some(name => !manifest.permissions.includes(name))) {
      throw new Error('Plugin role template declares an unrelated permission');
    }
    const existing = await tx.role.findUnique({ where: { name: template.name }, select: { id: true } });
    if (existing) continue;
    // A concurrent custom-role creation must fail rather than silently be adopted.
    let role: { id: string };
    try {
      role = await tx.role.create({ data: {
        name: template.name,
        permissions: { connect: template.permissions.map(name => ({ name })) },
      } });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') throw new ConflictException('PLUGIN_ROLE_CREATE_CONFLICT');
      throw error;
    }
    await tx.$executeRaw`INSERT INTO plugin_support_center.managed_roles(role_id,template_name) VALUES (${role.id}, ${template.name})`;
  }
}
