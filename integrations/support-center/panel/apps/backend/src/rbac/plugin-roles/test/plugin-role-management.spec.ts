import { PluginRoleManagementService } from '../plugin-role-management.service';
import { RbacService } from '../../rbac.service';

describe('plugin-managed role ownership', () => {
  let tx: any;
  let prisma: any;
  let service: PluginRoleManagementService;
  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $executeRawUnsafe: jest.fn(),
      role: { findUnique: jest.fn(), findMany: jest.fn() },
      adminAuditLog: { create: jest.fn() },
    };
    prisma = {
      role: { findMany: jest.fn() },
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    };
    service = new PluginRoleManagementService(prisma);
  });
  it('protects a bound role even when the plugin is disabled', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ status: 'DISABLED' }])
      .mockResolvedValueOnce([{ name: 'plugin_support_center.managed_roles' }])
      .mockResolvedValueOnce([{ roleId: 'owned' }]);
    await expect(service.assertMutable(tx, 'owned', 'DELETE')).rejects.toThrow(
      'PLUGIN_ROLE_DELETE_PROTECTED',
    );
  });
  it('does not infer ownership from a role name or take over an older installation', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ status: 'INSTALLED' }])
      .mockResolvedValueOnce([{ name: null }]);
    await expect(
      service.assertMutable(tx, 'custom-support', 'DELETE'),
    ).resolves.toBeUndefined();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
  it('returns display metadata by role ID and preserves unrelated roles', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ status: 'DISABLED' }])
      .mockResolvedValueOnce([{ name: 'plugin_support_center.managed_roles' }])
      .mockResolvedValueOnce([{ roleId: 'owned' }]);
    expect(
      await service.decorate([
        { id: 'owned', name: 'Support' },
        { id: 'custom', name: 'Another role' },
      ]),
    ).toEqual([
      {
        id: 'owned',
        name: 'Support',
        management: {
          pluginId: 'tyravex.support-center',
          pluginStatus: 'DISABLED',
          protected: true,
        },
      },
      { id: 'custom', name: 'Another role', management: null },
    ]);
  });
  it('requires exact confirmation before any binding or migration', async () => {
    await expect(service.bind('role', 1, 'wrong')).rejects.toThrow(
      'PLUGIN_ROLE_CONFIRMATION_REQUIRED',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('adds only ticket permissions on explicit repair without replacing existing role permissions', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'plugin' }])
      .mockResolvedValueOnce([]);
    tx.role.findUnique.mockResolvedValue({ id: 'role', name: 'Support' });
    tx.role.update = jest.fn();
    tx.permission = { upsert: jest.fn() };
    tx.rbacSettings = {
      findUnique: jest.fn().mockResolvedValue({ defaultRoleId: 'user' }),
    };
    await service.enableTicketManagement('role', 7, 'role');
    expect(tx.role.update).toHaveBeenCalledWith({
      where: { id: 'role' },
      data: {
        permissions: {
          connect: [{ name: 'support:read' }, { name: 'support:manage' }],
        },
      },
    });
    expect(tx.permission.upsert).toHaveBeenCalledTimes(2);
    expect(tx.permission.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'support:access' } }),
    );
    expect(tx).not.toHaveProperty('userRole');
  });
  it('rejects repair of a default role before assigning global permissions', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'plugin' }]);
    tx.role.findUnique.mockResolvedValue({ id: 'role', name: 'Support' });
    tx.rbacSettings = {
      findUnique: jest.fn().mockResolvedValue({ defaultRoleId: 'role' }),
    };
    await expect(
      service.enableTicketManagement('role', 7, 'role'),
    ).rejects.toThrow('PLUGIN_ROLE_IS_DEFAULT');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('explicitly binds an existing role without modifying its permissions or memberships', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'plugin' }])
      .mockResolvedValueOnce([]);
    tx.role.findUnique.mockResolvedValue({ id: 'role', name: 'Support' });
    expect(await service.bind('role', 7, 'role')).toEqual({
      roleId: 'role',
      protected: true,
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE TABLE plugin_support_center.managed_roles',
      ),
    );
    expect(tx.role).not.toHaveProperty('update');
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 7,
        action: 'PLUGIN_ROLE_BOUND',
        targetId: 'role',
      }),
    });
  });
  it('enforces protection in the role service instead of relying on the disabled UI button', async () => {
    const policy = {
      assertMutable: jest
        .fn()
        .mockRejectedValue(new Error('PLUGIN_ROLE_DELETE_PROTECTED')),
    };
    const roleTx = {
      $queryRaw: jest.fn(),
      role: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Support' }),
        delete: jest.fn(),
        update: jest.fn(),
      },
    };
    const rbac = new RbacService(
      { $transaction: (fn: any) => fn(roleTx) } as never,
      policy as never,
    );
    await expect(rbac.deleteRole('owned', 1)).rejects.toThrow(
      'PLUGIN_ROLE_DELETE_PROTECTED',
    );
    expect(roleTx.role.delete).not.toHaveBeenCalled();
    policy.assertMutable.mockRejectedValue(
      new Error('PLUGIN_ROLE_NAME_PROTECTED'),
    );
    await expect(
      rbac.updateRole('owned', { name: 'Changed', permissionIds: [] }, 1),
    ).rejects.toThrow('PLUGIN_ROLE_NAME_PROTECTED');
    expect(roleTx.role.update).not.toHaveBeenCalled();
  });
});
