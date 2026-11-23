import { ConflictException } from '@nestjs/common';
import type { SupportTicketStatus } from '@shared/types';
import type { Tx } from '../support-context';

const transitions: Record<SupportTicketStatus, readonly SupportTicketStatus[]> =
  {
    OPEN: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
    IN_PROGRESS: ['OPEN', 'RESOLVED', 'CLOSED'],
    RESOLVED: ['OPEN', 'CLOSED'],
    CLOSED: ['OPEN'],
  };

export function assertSupportStatusTransition(
  current: SupportTicketStatus,
  next: string,
) {
  if (
    current !== next &&
    !transitions[current].includes(next as SupportTicketStatus)
  )
    throw new ConflictException('SUPPORT_STATUS_INVALID');
}

/** Caller holds the account mutation lock, including when reopening on another service. */
export async function assertSupportTicketCapacity(tx: Tx, ownerId: number) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(847204,${ownerId})::text`;
  const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*) FROM plugin_support_center.tickets WHERE owner_id=${ownerId} AND status IN ('OPEN','IN_PROGRESS')`;
  if (rows[0].count >= 20n) throw new ConflictException('SUPPORT_TICKET_LIMIT');
}
