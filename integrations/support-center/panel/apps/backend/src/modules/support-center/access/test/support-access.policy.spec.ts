import {
  checkSupportGrant,
  authorizeSupportWorkspace,
  type ActiveSupportGrant,
} from '../support-access.policy';

const now = new Date('2026-11-22T12:00:00Z');
const grant = (): ActiveSupportGrant => ({
  status: 'ACTIVE',
  expiresAt: new Date(now.getTime() + 60000),
  scopes: ['status', 'files:read', 'files:write'],
  staffId: 2,
  ownerId: 1,
  currentOwnerId: 1,
  ticketStatus: 'OPEN',
});
describe('support workspace consent', () => {
  it('allows exactly the approved service operations', () => {
    expect(() =>
      checkSupportGrant(grant(), 2, 'files.read', { path: '/bot.js' }, now),
    ).not.toThrow();
    expect(() => checkSupportGrant(grant(), 2, 'backup.read', {}, now)).toThrow(
      'SUPPORT_SCOPE_DENIED',
    );
    expect(() =>
      checkSupportGrant(
        { ...grant(), scopes: ['status'] },
        2,
        'files.list',
        {},
        now,
      ),
    ).toThrow('SUPPORT_SCOPE_DENIED');
  });
  it.each(['PENDING', 'REVOKED', 'REJECTED'])(
    'rejects a %s grant',
    (status) => {
      expect(() =>
        checkSupportGrant({ ...grant(), status }, 2, 'runtime.status', {}, now),
      ).toThrow('SUPPORT_ACCESS_INACTIVE');
    },
  );
  it('rejects expiry, wrong staff, owner transfer and closed tickets', () => {
    for (const change of [
      { expiresAt: now },
      { expiresAt: null },
      { staffId: 3 },
      { currentOwnerId: 3 },
      { ticketStatus: 'CLOSED' },
    ]) {
      expect(() =>
        checkSupportGrant(
          { ...grant(), ...change },
          2,
          'runtime.status',
          {},
          now,
        ),
      ).toThrow('SUPPORT_ACCESS_INACTIVE');
    }
  });
  it.each([
    '/.env',
    '/config/.env.production',
    '/private.key',
    '/credentials.json',
    '/.ssh/id_rsa',
    '/token.txt',
  ])('requires separate secret consent for %s', (path) => {
    expect(() =>
      checkSupportGrant(grant(), 2, 'files.read', { path }, now),
    ).toThrow('SUPPORT_SECRETS_DENIED');
    expect(() =>
      checkSupportGrant(
        { ...grant(), scopes: [...grant().scopes, 'secrets'] },
        2,
        'files.read',
        { path },
        now,
      ),
    ).not.toThrow();
  });
  it('rechecks plugin activation before accessing plugin tables', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findFirst: jest.fn() },
    };
    await expect(
      authorizeSupportWorkspace(
        tx as never,
        2,
        'service',
        'runtime.status',
        {},
        { ticketId: 'ticket', grantId: 'grant' },
      ),
    ).rejects.toThrow('SUPPORT_DISABLED');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.user.findFirst).not.toHaveBeenCalled();
  });
  it('requires current database staff permissions even with an old JWT', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'plugin' }]),
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      authorizeSupportWorkspace(
        tx as never,
        2,
        'service',
        'runtime.status',
        {},
        { ticketId: 'ticket', grantId: 'grant' },
      ),
    ).rejects.toThrow('SUPPORT_SCOPE_DENIED');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
