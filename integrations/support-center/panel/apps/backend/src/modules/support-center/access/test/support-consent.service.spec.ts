import { SupportConsentService } from '../support-consent.service';

describe('owner-initiated support consent', () => {
  const owner = { id: 1, username: 'client', permissions: [] };
  const dto = {
    staffId: 4,
    reason: 'Investigate this service',
    scopes: ['status', 'files:read'],
    durationMinutes: 30,
  };
  let tx: any;
  let service: SupportConsentService;
  let ticket: any;
  let assigned: number;
  let current: any[];
  beforeEach(() => {
    ticket = {
      id: 'ticket',
      serviceId: 'service',
      ownerId: 1,
      currentOwnerId: 1,
      status: 'IN_PROGRESS',
    };
    assigned = 4;
    current = [];
    tx = {
      $queryRaw: jest.fn().mockImplementation((parts: TemplateStringsArray) => {
        const sql = parts.join('');
        if (sql.includes('FROM "Plugin"')) return [{ id: 'plugin' }];
        if (sql.includes('plugin_support_center.migrations'))
          return [{ ready: true }];
        if (sql.includes('SELECT t.id::text')) return [ticket];
        if (sql.includes('SELECT status FROM'))
          return [{ status: ticket.status }];
        if (sql.includes('assigned_staff_id')) return [{ staffId: assigned }];
        if (sql.includes('FROM plugin_support_center.grants')) return current;
        if (sql.includes('SELECT COALESCE(t.service_id'))
          return [{ serviceId: 'service', serviceName: 'Bot', ownerId: 1 }];
        return [];
      }),
      $executeRaw: jest.fn(),
      user: { findFirst: jest.fn().mockResolvedValue({ username: 'admin4' }) },
      notification: { create: jest.fn() },
    };
    service = new SupportConsentService({
      run: (_actor: any, _action: any, _payload: any, fn: any) => fn(tx),
    } as any);
  });
  it('lets the current owner grant only the displayed assignee scoped, expiring access', async () => {
    await expect(
      service.grantToAssignee('ticket', owner, dto),
    ).resolves.toEqual({ ok: true });
    expect(tx.$executeRaw.mock.calls[0][0].join('')).toContain("'ACTIVE'");
    expect(tx.$executeRaw.mock.calls[0]).toContain('admin4');
    expect(tx.$executeRaw.mock.calls[0]).toContain(dto.scopes);
    expect(tx.$executeRaw.mock.calls[0]).toContain(30);
    expect(tx.$executeRaw.mock.calls[1][0].join('')).toContain(
      'ACCESS_GRANTED_BY_OWNER',
    );
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 4 }),
    });
    expect(tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 4,
          isActive: true,
          AND: expect.any(Array),
        }),
      }),
    );
  });
  it('never lets a staff account grant itself access to another owners service', async () => {
    await expect(
      service.grantToAssignee(
        'ticket',
        {
          id: 4,
          username: 'admin4',
          permissions: ['support:read', 'support:access'],
        },
        dto,
      ),
    ).rejects.toThrow('SUPPORT_OWNER_REQUIRED');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('rejects a stale recipient after assignment changed', async () => {
    assigned = 5;
    await expect(service.grantToAssignee('ticket', owner, dto)).rejects.toThrow(
      'SUPPORT_ASSIGNEE_CHANGED',
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('does not grant access to inactive or ineligible staff', async () => {
    tx.user.findFirst.mockResolvedValue(null);
    await expect(service.grantToAssignee('ticket', owner, dto)).rejects.toThrow(
      'SUPPORT_STAFF_ACCESS_REQUIRED',
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('does not create duplicate access alongside an existing request or active grant', async () => {
    current = [{ id: 'existing' }];
    await expect(service.grantToAssignee('ticket', owner, dto)).rejects.toThrow(
      'SUPPORT_ACCESS_EXISTS',
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('rejects grants after ownership transfer, ticket closure and self-grants', async () => {
    ticket.currentOwnerId = 2;
    await expect(service.grantToAssignee('ticket', owner, dto)).rejects.toThrow(
      'SUPPORT_OWNER_REQUIRED',
    );
    ticket.currentOwnerId = 1;
    ticket.status = 'CLOSED';
    await expect(service.grantToAssignee('ticket', owner, dto)).rejects.toThrow(
      'SUPPORT_TICKET_CLOSED',
    );
    ticket.status = 'OPEN';
    assigned = 1;
    await expect(
      service.grantToAssignee('ticket', owner, { ...dto, staffId: 1 }),
    ).rejects.toThrow('SUPPORT_SELF_ACCESS_DENIED');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
