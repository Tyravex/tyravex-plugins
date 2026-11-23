import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsGateway } from '@/modules/notifications/notifications.gateway';
import type { SupportActor, Tx } from '../support-context';
import { lockSupportPlugin } from '../access/support-access.policy';
import { requireSupportWorkflow } from '../workflow/support-workflow.policy';
import { beginSupportNotifications } from '../notifications/support-notification-buffer';
import { SupportRateLimitException } from './support-rate-limit.exception';

const limits: Record<string, [number, number]> = {
  create: [5, 600],
  message: [20, 60],
  note: [20, 60],
  status: [15, 60],
  assign: [15, 60],
  access: [6, 60],
  decision: [15, 60],
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

@Injectable()
export class SupportMutationService {
  private readonly logger = new Logger(SupportMutationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async run<T>(
    actor: SupportActor,
    action: string,
    payload: unknown,
    callback: (tx: Tx) => Promise<T>,
    key?: string,
  ): Promise<T> {
    if (
      key !== undefined &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        key,
      )
    )
      throw new BadRequestException('SUPPORT_IDEMPOTENCY_INVALID');
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(canonical({ action, payload })))
      .digest('hex');
    let notifications: ReturnType<typeof beginSupportNotifications> = [];
    const outcome = await this.prisma.$transaction(async (tx) => {
      await lockSupportPlugin(tx);
      await requireSupportWorkflow(tx);
      // Serialize mutations per account across services and API processes.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(847203,${actor.id})::text`;
      if (key) {
        const previous = await tx.$queryRaw<
          Array<{ fingerprint: string; response: T }>
        >`
          SELECT fingerprint,response FROM plugin_support_center.mutation_receipts
          WHERE actor_id=${actor.id} AND key=${key}::uuid AND expires_at>clock_timestamp()`;
        if (previous.length) {
          if (previous[0].fingerprint !== fingerprint)
            throw new ConflictException('SUPPORT_IDEMPOTENCY_CONFLICT');
          return { value: previous[0].response, retryAfter: 0 };
        }
      }
      const [maximum, seconds] = limits[action];
      const counter = await tx.$queryRaw<
        Array<{ attempts: number; retryAfter: number }>
      >`
        INSERT INTO plugin_support_center.rate_limits(actor_id,action,window_start,attempts)
        VALUES (${actor.id},${action},clock_timestamp(),1)
        ON CONFLICT(actor_id,action) DO UPDATE SET
          attempts=CASE WHEN rate_limits.window_start+make_interval(secs=>${seconds})<=clock_timestamp() THEN 1 ELSE rate_limits.attempts+1 END,
          window_start=CASE WHEN rate_limits.window_start+make_interval(secs=>${seconds})<=clock_timestamp() THEN clock_timestamp() ELSE rate_limits.window_start END
        RETURNING attempts,GREATEST(1,ceil(extract(epoch FROM window_start+make_interval(secs=>${seconds})-clock_timestamp())))::int AS "retryAfter"`;
      if (counter[0].attempts > maximum)
        return { retryAfter: counter[0].retryAfter };
      notifications = beginSupportNotifications(tx);
      const value = await callback(tx);
      if (key) {
        await tx.$executeRaw`DELETE FROM plugin_support_center.mutation_receipts WHERE (actor_id,key) IN (
          SELECT actor_id,key FROM plugin_support_center.mutation_receipts WHERE expires_at<=clock_timestamp()
          ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED)`;
        // Only mutation acknowledgements are stored; file contents and message bodies are never retained here.
        await tx.$executeRaw`INSERT INTO plugin_support_center.mutation_receipts(actor_id,key,fingerprint,response)
          VALUES (${actor.id},${key}::uuid,${fingerprint},${JSON.stringify(value)}::jsonb)
          ON CONFLICT(actor_id,key) DO UPDATE SET fingerprint=EXCLUDED.fingerprint,response=EXCLUDED.response,expires_at=now()+interval '24 hours'`;
      }
      return { value, retryAfter: 0 };
    });
    if (outcome.retryAfter)
      throw new SupportRateLimitException(outcome.retryAfter);
    // Socket delivery happens only after COMMIT. The durable notification remains available on reconnect/refresh.
    for (const notification of notifications) {
      try {
        await this.gateway.sendToUser(notification.userId, notification);
      } catch {
        this.logger.warn('Support notification socket delivery unavailable');
      }
    }
    return outcome.value as T;
  }
}
