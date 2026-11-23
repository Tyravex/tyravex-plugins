import { SupportMutationService } from '../support-mutation.service';
import { bufferSupportNotification } from '../../notifications/support-notification-buffer';

describe('support transaction delivery boundary', () => {
  const actor = { id: 7, username: 'client', permissions: [] };
  const notification = {
    id: 1,
    userId: 7,
    content: 'safe metadata',
    createdAt: new Date(),
    read: false,
  };
  let tx: any;
  let prisma: any;
  let gateway: any;
  let mutations: SupportMutationService;
  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockImplementation((sql: TemplateStringsArray) => {
        const text = sql.join('');
        if (text.includes('FROM "Plugin"')) return [{ id: 'plugin' }];
        if (text.includes(' AS ready')) return [{ ready: true }];
        if (text.includes('RETURNING attempts'))
          return [{ attempts: 1, retryAfter: 60 }];
        return [];
      }),
      $executeRaw: jest.fn(),
    };
    prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    gateway = { sendToUser: jest.fn() };
    mutations = new SupportMutationService(prisma, gateway);
  });
  it('does not deliver a notification when commit fails after the mutation', async () => {
    prisma.$transaction.mockImplementation(async (fn: any) => {
      await fn(tx);
      throw Error('Commit failed');
    });
    await expect(
      mutations.run(actor, 'message', {}, async (transaction) => {
        bufferSupportNotification(transaction, notification);
        return { ok: true };
      }),
    ).rejects.toThrow('Commit failed');
    expect(gateway.sendToUser).not.toHaveBeenCalled();
  });
  it('does not turn a committed mutation into a failure when socket delivery fails', async () => {
    gateway.sendToUser.mockRejectedValue(Error('Disconnected'));
    await expect(
      mutations.run(actor, 'message', {}, async (transaction) => {
        bufferSupportNotification(transaction, notification);
        return { ok: true };
      }),
    ).resolves.toEqual({ ok: true });
    expect(gateway.sendToUser).toHaveBeenCalledWith(7, notification);
  });
  it('rejects malformed keys before opening a transaction', async () => {
    await expect(
      mutations.run(actor, 'message', {}, jest.fn(), 'invalid'),
    ).rejects.toThrow('SUPPORT_IDEMPOTENCY_INVALID');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
