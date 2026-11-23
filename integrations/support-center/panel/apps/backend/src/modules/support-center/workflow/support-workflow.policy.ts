import { ConflictException } from '@nestjs/common';
import type { Tx, SupportActor, TicketRow } from '../support-context';

export async function supportWorkflowReady(tx: Tx) {
  const rows = await tx.$queryRaw<
    Array<{ ready: boolean }>
  >`SELECT EXISTS(SELECT 1 FROM plugin_support_center.migrations WHERE id='004_reliability') AS ready`;
  return rows[0]?.ready === true;
}
export async function requireSupportWorkflow(tx: Tx) {
  if (!(await supportWorkflowReady(tx)))
    throw new ConflictException('SUPPORT_UPGRADE_REQUIRED');
}
export function mayReadInternalNotes(
  ticket: TicketRow,
  actor: SupportActor,
  staffView: boolean,
) {
  return (
    staffView &&
    ticket.ownerId !== actor.id &&
    actor.permissions.includes('support:read')
  );
}
