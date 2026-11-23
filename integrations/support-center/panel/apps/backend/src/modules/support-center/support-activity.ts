import { randomUUID } from 'node:crypto';
import type { SupportActor, Tx } from './support-context';

export async function supportEvent(
  tx: Tx,
  ticketId: string,
  actor: SupportActor,
  action: string,
) {
  await tx.$executeRaw`INSERT INTO plugin_support_center.events(id,ticket_id,actor_id,actor_name,action)
      VALUES (${randomUUID()}::uuid, ${ticketId}::uuid, ${actor.id}, ${actor.username}, ${action})`;
}
