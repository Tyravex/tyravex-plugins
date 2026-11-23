import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PluginManagedRole } from '@shared/types';
import { PrismaService } from '@/prisma/prisma.service';
import { applyManagedRoleMigration } from '@/modules/plugins/functional/functional-plugin-migrations';

type Tx = Prisma.TransactionClient;
type Binding = { roleId: string; pluginStatus: 'INSTALLED' | 'DISABLED' };
const pluginId = 'tyravex.support-center';

@Injectable()
export class PluginRoleManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async bindings(tx: Tx): Promise<Binding[]> {
    // The row lock also coordinates with explicit plugin uninstallation/schema removal.
    const plugin = await tx.$queryRaw<
      Array<{ status: Binding['pluginStatus'] }>
    >`SELECT status FROM "Plugin" WHERE id=${pluginId} AND "storagePath"='native/tyravex.support-center' AND status IN ('INSTALLED','DISABLED') FOR SHARE`;
    if (!plugin.length) return [];
    const table = await tx.$queryRaw<
      Array<{ name: string | null }>
    >`SELECT to_regclass('plugin_support_center.managed_roles')::text AS name`;
    if (!table[0]?.name) return [];
    const rows = await tx.$queryRaw<
      Array<{ roleId: string }>
    >`SELECT role_id AS "roleId" FROM plugin_support_center.managed_roles`;
    return rows.map((row) => ({ ...row, pluginStatus: plugin[0].status }));
  }

  async decorate<T extends { id: string }>(
    roles: T[],
  ): Promise<Array<T & { management: PluginManagedRole | null }>> {
    if (!roles.length) return [];
    const bindings = await this.prisma.$transaction((tx) => this.bindings(tx));
    return roles.map((role) => {
      const owned = bindings.find((binding) => binding.roleId === role.id);
      return {
        ...role,
        management: owned
          ? { pluginId, pluginStatus: owned.pluginStatus, protected: true }
          : null,
      };
    });
  }

  async assertMutable(tx: Tx, roleId: string, operation: 'DELETE' | 'RENAME') {
    if (
      (await this.bindings(tx)).some((binding) => binding.roleId === roleId)
    ) {
      throw new ConflictException(
        operation === 'DELETE'
          ? 'PLUGIN_ROLE_DELETE_PROTECTED'
          : 'PLUGIN_ROLE_NAME_PROTECTED',
      );
    }
  }

  async candidates() {
    const roles = await this.prisma.role.findMany({
      where: { name: 'Support' },
      select: { id: true, name: true, permissions: { select: { name: true } } },
    });
    const decorated = await this.decorate(roles);
    return decorated.map((role) => ({
      id: role.id,
      name: role.name,
      managed: !!role.management,
      permissions: role.permissions.map((permission) => permission.name),
    }));
  }

  async bind(roleId: string, actorId: number, confirmation: string) {
    return this.configure(roleId, actorId, confirmation, false);
  }

  async enableTicketManagement(
    roleId: string,
    actorId: number,
    confirmation: string,
  ) {
    return this.configure(roleId, actorId, confirmation, true);
  }

  private async configure(
    roleId: string,
    actorId: number,
    confirmation: string,
    enableTickets: boolean,
  ) {
    if (!roleId || confirmation !== roleId)
      throw new BadRequestException('PLUGIN_ROLE_CONFIRMATION_REQUIRED');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(847201, 1)::text`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('tyravex.support-center.lifecycle'))::text`;
      const plugin = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "Plugin" WHERE id=${pluginId} AND "storagePath"='native/tyravex.support-center' AND status IN ('INSTALLED','DISABLED') FOR UPDATE`;
      if (!plugin.length) throw new NotFoundException('PLUGIN_NOT_FOUND');
      const role = await tx.role.findUnique({
        where: { id: roleId },
        select: { id: true, name: true },
      });
      if (!role || role.name !== 'Support')
        throw new NotFoundException('PLUGIN_ROLE_NOT_FOUND');
      if (enableTickets) {
        const settings = await tx.rbacSettings.findUnique({
          where: { id: 1 },
          select: { defaultRoleId: true },
        });
        if (settings?.defaultRoleId === roleId)
          throw new ConflictException('PLUGIN_ROLE_IS_DEFAULT');
        // An explicit administrator action adds only ticket permissions and preserves all other grants.
        for (const name of ['support:read', 'support:manage']) {
          await tx.permission.upsert({
            where: { name },
            create: { name },
            update: {},
          });
        }
        await tx.role.update({
          where: { id: roleId },
          data: {
            permissions: {
              connect: ['support:read', 'support:manage'].map((name) => ({
                name,
              })),
            },
          },
        });
      }
      // Upgrades an older local installation only after explicit role-ID confirmation.
      await applyManagedRoleMigration(tx);
      const changed =
        await tx.$executeRaw`INSERT INTO plugin_support_center.managed_roles(role_id,template_name) VALUES (${roleId}, 'Support') ON CONFLICT (role_id) DO NOTHING`;
      if (changed)
        await tx.adminAuditLog.create({
          data: {
            actorId,
            action: 'PLUGIN_ROLE_BOUND',
            targetType: 'ROLE',
            targetId: roleId,
            metadata: { pluginId },
          },
        });
      if (enableTickets)
        await tx.adminAuditLog.create({
          data: {
            actorId,
            action: 'PLUGIN_ROLE_TICKETS_ENABLED',
            targetType: 'ROLE',
            targetId: roleId,
            metadata: {
              pluginId,
              permissions: ['support:read', 'support:manage'],
            },
          },
        });
      return { roleId, protected: true };
    });
  }
}
