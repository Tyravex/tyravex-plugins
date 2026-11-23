import { PluginLifecycleService } from '../../lifecycle/plugin-lifecycle.service';

it('disables only plugin capabilities and revokes consent without changing mixed roles or memberships', async () => {
  const plugin = { id: 'tyravex.support-center', type: 'INTEGRATION', status: 'INSTALLED', version: '0.1.0', storagePath: 'native/tyravex.support-center' };
  const tx = {
    plugin: { findUnique: jest.fn().mockResolvedValue(plugin), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ ...plugin, status: 'DISABLED' }) },
    $executeRaw: jest.fn(), adminAuditLog: { create: jest.fn() }, role: { update: jest.fn() }, userRole: { deleteMany: jest.fn() },
  };
  const lifecycle = new PluginLifecycleService({ $transaction: (fn: any) => fn(tx) } as never);
  await lifecycle.disable(plugin.id, 1);
  expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  expect(tx.$executeRaw.mock.calls[0][0].join('')).toContain("status = 'REVOKED'");
  expect(tx.role.update).not.toHaveBeenCalled();
  expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  tx.plugin.findUnique.mockResolvedValue({ ...plugin, status: 'DISABLED' });
  tx.$executeRaw.mockClear();
  await lifecycle.enable(plugin.id, 1);
  expect(tx.$executeRaw).not.toHaveBeenCalled();
});
