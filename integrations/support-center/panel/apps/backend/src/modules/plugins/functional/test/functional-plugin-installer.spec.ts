import { FunctionalPluginInstallerService } from '../functional-plugin-installer.service';
import { supportCenterManifest as manifest } from '@/plugins/support-center/manifest';

describe('local functional plugin installation', () => {
  let tx: any;
  let prisma: any;
  let installer: FunctionalPluginInstallerService;
  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn(),
      $executeRawUnsafe: jest.fn(),
      plugin: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: manifest.id,
          version: manifest.version,
          status: 'INSTALLED',
        }),
        delete: jest.fn(),
      },
      permission: {
        upsert: jest
          .fn()
          .mockImplementation(({ create }) => ({ id: create.name })),
      },
      role: {
        upsert: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'new-support' }),
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) =>
            where.name === 'Owner' ? { id: 'owner' } : null,
          ),
        update: jest.fn(),
      },
      adminAuditLog: { create: jest.fn() },
    };
    prisma = {
      plugin: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    };
    installer = new FunctionalPluginInstallerService(prisma);
  });
  it('listing local plugins does not create schemas or register permissions', async () => {
    expect(await installer.localCatalog()).toMatchObject([
      { source: 'BUNDLED', installed: null },
    ]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
  it('rejects unknown plugins and missing confirmation before database writes', async () => {
    await expect(
      installer.install('evil.plugin', 1, 'evil.plugin'),
    ).rejects.toThrow('PLUGIN_NOT_FOUND');
    await expect(installer.install(manifest.id, 1, '')).rejects.toThrow(
      'PLUGIN_CONFIRMATION_REQUIRED',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('runs only reviewed static migrations inside the registration transaction', async () => {
    await installer.install(manifest.id, 1, manifest.id);
    expect(tx.$executeRawUnsafe.mock.calls[0][0]).toBe(
      'CREATE SCHEMA IF NOT EXISTS plugin_support_center',
    );
    expect(tx.plugin.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'INTEGRATION',
        storagePath: `native/${manifest.id}`,
      }),
    });
    expect(tx.permission.upsert).toHaveBeenCalledTimes(3);
    expect(tx.role.create).toHaveBeenCalledWith({
      data: {
        name: 'Support',
        permissions: {
          connect: [{ name: 'support:read' }, { name: 'support:manage' }],
        },
      },
    });
    expect(tx.role.findUnique).toHaveBeenCalledWith({
      where: { name: 'Owner' },
    });
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 1,
        action: 'PLUGIN_LOCAL_INSTALLED',
      }),
    });
  });
  it('rejects installation over an existing plugin', async () => {
    tx.plugin.findUnique.mockResolvedValue({ id: manifest.id });
    await expect(
      installer.install(manifest.id, 1, manifest.id),
    ).rejects.toThrow('PLUGIN_ALREADY_INSTALLED');
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
  it('does not replay a retained migration whose checksum changed', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ checksum: 'changed' }]);
    await expect(
      installer.install(manifest.id, 1, manifest.id),
    ).rejects.toThrow('PLUGIN_MIGRATION_CHANGED');
    expect(tx.plugin.create).not.toHaveBeenCalled();
  });
  it('requires disable before uninstalling and preserves data by default choice', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { status: 'INSTALLED', storagePath: `native/${manifest.id}` },
      ]);
    await expect(
      installer.uninstall(manifest.id, 1, manifest.id, false),
    ).rejects.toThrow('PLUGIN_DISABLE_FIRST');
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { status: 'DISABLED', storagePath: `native/${manifest.id}` },
      ]);
    await installer.uninstall(manifest.id, 1, manifest.id, false);
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(tx.plugin.delete).toHaveBeenCalled();
  });
  it('deletes only the owned schema when explicitly requested', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { status: 'DISABLED', storagePath: `native/${manifest.id}` },
      ]);
    await installer.uninstall(manifest.id, 1, manifest.id, true);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'DROP SCHEMA plugin_support_center RESTRICT',
    );
    expect(
      tx.$executeRawUnsafe.mock.calls.every(
        ([sql]: string[]) => !sql.includes('CASCADE'),
      ),
    ).toBe(true);
  });
});
