import { registerPluginRoleTemplates } from '../functional-plugin-role-templates';
import { supportCenterManifest } from '@/plugins/support-center/manifest';

describe('functional plugin role templates', () => {
  it('preserves an existing role without adopting it or changing permissions and assignments', async () => {
    const tx = { role: { findUnique: jest.fn().mockResolvedValue({ id: 'existing-role' }), create: jest.fn() }, $executeRaw: jest.fn() };
    await registerPluginRoleTemplates(tx as never, supportCenterManifest);
    expect(tx.role.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('creates a least-privilege role without assigning users and binds its ID', async () => {
    const tx = { role: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'new-role' }) }, $executeRaw: jest.fn() };
    await registerPluginRoleTemplates(tx as never, supportCenterManifest);
    const input = tx.role.create.mock.calls[0][0];
    expect(input.data).toEqual({ name: 'Support', permissions: { connect: [{ name: 'support:read' }, { name: 'support:manage' }] } });
    expect(input.data).not.toHaveProperty('users');
    expect(JSON.stringify(input)).not.toContain('support:access');
    expect(tx.$executeRaw).toHaveBeenCalledWith(expect.any(Array), 'new-role', 'Support');
  });
  it('does not adopt a custom role created concurrently', async () => {
    const tx = { role: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockRejectedValue({ code: 'P2002' }) }, $executeRaw: jest.fn() };
    await expect(registerPluginRoleTemplates(tx as never, supportCenterManifest)).rejects.toThrow('PLUGIN_ROLE_CREATE_CONFLICT');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('rejects unrelated permission declarations before changing roles', async () => {
    const tx = { role: { create: jest.fn() } };
    await expect(registerPluginRoleTemplates(tx as never, { ...supportCenterManifest, roleTemplates: [{ name: 'Unsafe', permissions: ['role:manage'] }] })).rejects.toThrow('unrelated permission');
    expect(tx.role.create).not.toHaveBeenCalled();
  });
});
