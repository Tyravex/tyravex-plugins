import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { supportCenterManifest as manifest } from '@/plugins/support-center/manifest';
import { supportCenterInitialMigration } from '@/plugins/support-center/migrations/001-initial';
import { registerPluginRoleTemplates } from './functional-plugin-role-templates';
import {
  applyManagedRoleMigration,
  applySupportWorkflowMigration,
  applySupportReliabilityMigration,
} from './functional-plugin-migrations';

@Injectable()
export class FunctionalPluginInstallerService {
  constructor(private readonly prisma: PrismaService) {}

  async localCatalog() {
    const installed = await this.prisma.plugin.findUnique({
      where: { id: manifest.id },
      select: { status: true, version: true },
    });
    return [
      { manifest, source: 'LOCAL' as const, published: false, installed },
    ];
  }

  async install(id: string, actorId: number, confirmation: string) {
    if (id !== manifest.id) throw new NotFoundException('PLUGIN_NOT_FOUND');
    if (confirmation !== manifest.id)
      throw new BadRequestException('PLUGIN_CONFIRMATION_REQUIRED');
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(847201, 1)::text`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('tyravex.support-center.lifecycle'))::text`;
        if (await tx.plugin.findUnique({ where: { id } }))
          throw new ConflictException('PLUGIN_ALREADY_INSTALLED');
        // Schema creation is explicit and transactional, never an application startup hook.
        for (const sql of supportCenterInitialMigration.slice(0, 2))
          await tx.$executeRawUnsafe(sql);
        const checksum = createHash('sha256')
          .update(supportCenterInitialMigration.join('\n'))
          .digest('hex');
        const applied = await tx.$queryRaw<
          Array<{ checksum: string }>
        >`SELECT checksum FROM plugin_support_center.migrations WHERE id = '001_initial'`;
        if (applied.length && applied[0].checksum !== checksum)
          throw new ConflictException('PLUGIN_MIGRATION_CHANGED');
        if (!applied.length) {
          for (const sql of supportCenterInitialMigration.slice(2))
            await tx.$executeRawUnsafe(sql);
          await tx.$executeRaw`INSERT INTO plugin_support_center.migrations (id, checksum) VALUES ('001_initial', ${checksum})`;
        }
        await applyManagedRoleMigration(tx);
        await applySupportWorkflowMigration(tx);
        await applySupportReliabilityMigration(tx);
        // Retained data must not reactivate old grants after a reinstall.
        await tx.$executeRaw`UPDATE plugin_support_center.grants SET status = 'REVOKED' WHERE status IN ('PENDING','ACTIVE')`;
        for (const name of manifest.permissions) {
          const permission = await tx.permission.upsert({
            where: { name },
            create: { name },
            update: {},
          });
          // Only the system-managed Owner role receives new capabilities automatically.
          const owner = await tx.role.findUnique({ where: { name: 'Owner' } });
          if (owner)
            await tx.role.update({
              where: { id: owner.id },
              data: { permissions: { connect: { id: permission.id } } },
            });
        }
        await registerPluginRoleTemplates(tx, manifest);
        const plugin = await tx.plugin.create({
          data: {
            id,
            type: 'INTEGRATION',
            version: manifest.version,
            status: 'INSTALLED',
            storagePath: `native/${id}`,
          },
        });
        await tx.adminAuditLog.create({
          data: {
            actorId,
            action: 'PLUGIN_LOCAL_INSTALLED',
            targetType: 'Plugin',
            targetId: id,
            metadata: { version: manifest.version },
          },
        });
        return {
          id: plugin.id,
          version: plugin.version,
          status: plugin.status,
        };
      },
      { timeout: 30000 },
    );
  }

  async uninstall(
    id: string,
    actorId: number,
    confirmation: string,
    deleteData: boolean,
  ) {
    if (id !== manifest.id) throw new NotFoundException('PLUGIN_NOT_FOUND');
    if (confirmation !== id)
      throw new BadRequestException('PLUGIN_CONFIRMATION_REQUIRED');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(847201, 1)::text`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('tyravex.support-center.lifecycle'))::text`;
      const rows = await tx.$queryRaw<
        Array<{ status: string; storagePath: string }>
      >`SELECT status, "storagePath" FROM "Plugin" WHERE id = ${id} FOR UPDATE`;
      if (!rows.length || rows[0].storagePath !== `native/${id}`)
        throw new NotFoundException('PLUGIN_NOT_FOUND');
      if (rows[0].status !== 'DISABLED')
        throw new ConflictException('PLUGIN_DISABLE_FIRST');
      await tx.$executeRaw`UPDATE plugin_support_center.grants SET status = 'REVOKED' WHERE status IN ('PENDING','ACTIVE')`;
      if (deleteData) {
        await tx.$executeRawUnsafe(
          'DROP TRIGGER IF EXISTS support_archive_service ON public."Service"',
        );
        await tx.$executeRawUnsafe(
          'DROP FUNCTION IF EXISTS plugin_support_center.archive_service()',
        );
        // RESTRICT protects objects outside the plugin if an administrator added dependencies.
        await tx.$executeRawUnsafe(
          'DROP TABLE IF EXISTS plugin_support_center.mutation_receipts, plugin_support_center.rate_limits, plugin_support_center.reads, plugin_support_center.managed_roles, plugin_support_center.events, plugin_support_center.grants, plugin_support_center.messages, plugin_support_center.tickets, plugin_support_center.migrations',
        );
        await tx.$executeRawUnsafe(
          'DROP FUNCTION IF EXISTS plugin_support_center.snapshot_service()',
        );
        await tx.$executeRawUnsafe(
          'DROP SCHEMA plugin_support_center RESTRICT',
        );
      }
      await tx.plugin.delete({ where: { id } });
      await tx.adminAuditLog.create({
        data: {
          actorId,
          action: 'PLUGIN_LOCAL_UNINSTALLED',
          targetType: 'Plugin',
          targetId: id,
          metadata: { deleteData },
        },
      });
      return { id, removed: true, dataRetained: !deleteData };
    });
  }

  async upgrade(id: string, actorId: number, confirmation: string) {
    if (id !== manifest.id) throw new NotFoundException('PLUGIN_NOT_FOUND');
    if (confirmation !== id)
      throw new BadRequestException('PLUGIN_CONFIRMATION_REQUIRED');
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(847201, 1)::text`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('tyravex.support-center.lifecycle'))::text`;
        const plugin = await tx.$queryRaw<
          Array<{ status: string }>
        >`SELECT status FROM "Plugin" WHERE id=${id} AND "storagePath"='native/tyravex.support-center' FOR UPDATE`;
        if (
          !plugin.length ||
          !['INSTALLED', 'DISABLED'].includes(plugin[0].status)
        )
          throw new ConflictException('PLUGIN_NOT_FOUND');
        await applyManagedRoleMigration(tx);
        await applySupportWorkflowMigration(tx);
        await applySupportReliabilityMigration(tx);
        await tx.plugin.update({
          where: { id },
          data: { version: manifest.version },
        });
        await tx.adminAuditLog.create({
          data: {
            actorId,
            action: 'PLUGIN_LOCAL_UPDATED',
            targetType: 'Plugin',
            targetId: id,
            metadata: { version: manifest.version },
          },
        });
        return { id, version: manifest.version, status: plugin[0].status };
      },
      { timeout: 30000 },
    );
  }
}
