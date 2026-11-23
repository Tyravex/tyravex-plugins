import { SupportCenterService } from '../support-center.service';
const actor = { id: 1, username: 'client', permissions: [] };
const original = {
  id: 'ticket',
  serviceId: 'service',
  serviceName: 'Test',
  ownerId: 1,
  ownerName: 'client',
  currentOwnerId: 1,
  status: 'OPEN',
};
describe('support ticket authorization', () => {
  let tx: any;
  let prisma: any;
  let workspace: any;
  let service: SupportCenterService;
  let ticket: any;
  let grant: any;
  beforeEach(() => {
    ticket = { ...original };
    grant = {
      status: 'ACTIVE',
      expiresAt: new Date('2030-01-01'),
      scopes: ['status', 'files:read'],
      staffId: 2,
      ownerId: 1,
      currentOwnerId: 1,
      ticketStatus: 'OPEN',
    };
    tx = {
      $queryRaw: jest.fn().mockImplementation((parts: any) => {
        const sql = parts.join('');
        if (sql.includes('FROM "Plugin"')) return [{ id: 'plugin' }];
        if (sql.includes('plugin_support_center.migrations'))
          return [{ ready: true }];
        if (sql.includes('count(*)')) return [{ count: 0n }];
        if (sql.includes('SELECT t.id::text')) return [ticket];
        if (sql.includes('SELECT status FROM plugin_support_center.tickets'))
          return [{ status: ticket.status }];
        if (sql.includes('SELECT staff_id AS'))
          return [{ staffId: 2, status: 'PENDING', duration: 60 }];
        if (sql.includes('g.expires_at AS')) return [grant];
        if (sql.includes('SELECT COALESCE(t.service_id'))
          return [{ serviceId: 'service', serviceName: 'Bot', ownerId: 1 }];
        return [];
      }),
      $executeRaw: jest.fn(),
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 2 }),
        findMany: jest.fn().mockResolvedValue([{ id: 2 }]),
      },
      service: { findFirst: jest.fn() },
      notification: { create: jest.fn() },
    };
    prisma = {
      plugin: { findFirst: jest.fn().mockResolvedValue(null) },
      service: { findMany: jest.fn() },
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    };
    workspace = { execute: jest.fn() };
    service = new SupportCenterService(prisma, workspace, {
      run: (_actor: any, _action: any, _payload: any, fn: any) =>
        prisma.$transaction(fn),
    } as any);
  });
  it('availability never initializes plugin tables', async () => {
    expect(await service.availability()).toEqual({
      enabled: false,
      ready: false,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('denies reads before querying plugin tables when disabled', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.list(actor, false)).rejects.toThrow(
      'SUPPORT_DISABLED',
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('does not let an ordinary user select the staff queue', async () => {
    await expect(service.list(actor, true)).rejects.toThrow(
      'SUPPORT_SCOPE_DENIED',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('allows an authorized worker to start and resolve a ticket they created', async () => {
    const worker = {
      ...actor,
      permissions: ['support:read', 'support:manage'],
    };
    await expect(
      service.changeStatus('ticket', worker, 'IN_PROGRESS'),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.changeStatus('ticket', worker, 'RESOLVED'),
    ).resolves.toEqual({ ok: true });
  });
  it('does not grant staff actions to an ordinary ticket owner or a reader', async () => {
    for (const permissions of [[], ['support:read'], ['support:manage']]) {
      await expect(
        service.changeStatus(
          'ticket',
          { ...actor, permissions },
          'IN_PROGRESS',
        ),
      ).rejects.toThrow('SUPPORT_SCOPE_DENIED');
    }
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('continues to block a worker requesting service access to their own ticket', async () => {
    await expect(
      service.requestAccess(
        'ticket',
        { ...actor, permissions: ['support:read', 'support:access'] },
        {
          reason: 'Inspect my own service',
          scopes: ['status'],
          durationMinutes: 60,
        },
      ),
    ).rejects.toThrow('SUPPORT_TICKET_CLOSED');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('creates an owned-service ticket and notifies staff without copying message contents', async () => {
    tx.service.findFirst.mockResolvedValue({ id: 'service' });
    const result = await service.create(actor, {
      serviceId: 'service',
      subject: 'Startup issue',
      body: 'Please inspect my project',
    });
    expect(result.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(tx.service.findFirst).toHaveBeenCalledWith({
      where: { id: 'service', userId: 1 },
      select: { id: true },
    });
    const content = tx.notification.create.mock.calls[0][0].data.content;
    expect(content).not.toContain('Please inspect my project');
    expect(content).toContain('"serviceName":"Bot"');
    expect(content).toContain('"staff":true');
  });
  it('does not create a ticket for a service owned by another account', async () => {
    tx.service.findFirst.mockResolvedValue(null);
    await expect(
      service.create(actor, {
        serviceId: 'other',
        subject: 'Issue',
        body: 'Test message',
      }),
    ).rejects.toThrow('SUPPORT_SERVICE_NOT_FOUND');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('does not let staff approve their own access request', async () => {
    await expect(
      service.decide(
        'ticket',
        'grant',
        {
          id: 2,
          username: 'staff',
          permissions: ['support:read', 'support:access'],
        },
        'APPROVE',
      ),
    ).rejects.toThrow('SUPPORT_OWNER_REQUIRED');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('does not reveal another customer ticket', async () => {
    ticket.ownerId = 2;
    await expect(service.detail('ticket', actor)).rejects.toThrow(
      'SUPPORT_NOT_FOUND',
    );
  });
  it('does not reveal a ticket to the previous owner after a service transfer', async () => {
    ticket.currentOwnerId = 2;
    await expect(service.detail('ticket', actor)).rejects.toThrow(
      'SUPPORT_NOT_FOUND',
    );
  });
  it('does not allow a reader to request service access', async () => {
    await expect(
      service.requestAccess(
        'ticket',
        { ...actor, permissions: ['support:read'] },
        {
          reason: 'Inspect the project',
          scopes: ['status'],
          durationMinutes: 60,
        },
      ),
    ).rejects.toThrow('SUPPORT_SCOPE_DENIED');
  });
  it('passes a bound consent to the broker and removes logs from status-only responses', async () => {
    workspace.execute.mockResolvedValue({
      running: true,
      logs: 'secret token',
      memoryBytes: 123,
    });
    expect(
      await service.execute(
        'ticket',
        {
          id: 2,
          username: 'staff',
          permissions: ['support:read', 'support:access'],
        },
        { grantId: 'grant', operation: 'runtime.status', args: {} },
      ),
    ).toEqual({ running: true, memoryBytes: 123 });
    expect(workspace.execute).toHaveBeenCalledWith(
      2,
      'service',
      'runtime.status',
      {},
      false,
      undefined,
      { ticketId: 'ticket', grantId: 'grant' },
    );
  });
  it('does not release an agent response after consent is revoked', async () => {
    grant.status = 'REVOKED';
    workspace.execute.mockResolvedValue({ contentBase64: 'private' });
    await expect(
      service.execute(
        'ticket',
        {
          id: 2,
          username: 'staff',
          permissions: ['support:read', 'support:access'],
        },
        {
          grantId: 'grant',
          operation: 'files.read',
          args: { path: '/bot.js' },
        },
      ),
    ).rejects.toThrow('SUPPORT_ACCESS_INACTIVE');
  });
});
