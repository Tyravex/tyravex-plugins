import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { SupportTicket } from '@shared/types';

export interface SupportActor {
  id: number;
  username: string;
  permissions: string[];
}
export interface TicketRow {
  id: string;
  serviceId: string;
  serviceName: string;
  ownerId: number;
  ownerName: string;
  currentOwnerId: number | null;
  archivedAt?: Date | null;
  archivedOwnerId?: number | null;
  subject: string;
  status: SupportTicket['status'];
  createdAt: Date;
  updatedAt: Date;
}
export type Tx = Prisma.TransactionClient;

export async function loadSupportTicket(
  tx: Tx,
  id: string,
  actor: SupportActor,
  lock = false,
): Promise<TicketRow> {
  // All support mutations lock plugin -> service -> ticket, including broker dispatch.
  if (lock)
    await tx.$queryRaw`SELECT s.id FROM "Service" s JOIN plugin_support_center.tickets t ON t.service_id=s.id WHERE t.id=${id}::uuid FOR UPDATE OF s`;
  else
    await tx.$queryRaw`SELECT s.id FROM "Service" s JOIN plugin_support_center.tickets t ON t.service_id=s.id WHERE t.id=${id}::uuid FOR SHARE OF s`;
  const rows = await tx.$queryRaw<
    TicketRow[]
  >`SELECT t.id::text, COALESCE(t.service_id,t.service_snapshot_id) AS "serviceId", COALESCE(s.name,t.service_name) AS "serviceName",
      t.owner_id AS "ownerId", u.username AS "ownerName", s."userId" AS "currentOwnerId",t.archived_at AS "archivedAt",t.archived_owner_id AS "archivedOwnerId", t.subject, t.status,
      t.created_at AS "createdAt", t.updated_at AS "updatedAt"
      FROM plugin_support_center.tickets t LEFT JOIN "Service" s ON s.id=t.service_id JOIN "User" u ON u.id=t.owner_id WHERE t.id=${id}::uuid`;
  const ticket = rows[0];
  if (
    !ticket ||
    (ticket.ownerId !== actor.id && !actor.permissions.includes('support:read'))
  )
    throw new NotFoundException('SUPPORT_NOT_FOUND');
  if (lock)
    await tx.$queryRaw`SELECT id FROM plugin_support_center.tickets WHERE id=${id}::uuid FOR UPDATE`;
  // Re-read after the lock, so a simultaneous close/revoke cannot be overwritten.
  if (lock) {
    if (ticket.archivedAt)
      throw new ConflictException('SUPPORT_TICKET_ARCHIVED');
    const current = await tx.$queryRaw<
      Array<{ status: TicketRow['status'] }>
    >`SELECT status FROM plugin_support_center.tickets WHERE id=${id}::uuid`;
    ticket.status = current[0].status;
  }
  return ticket;
}
export function mayReadSupportAsOwner(ticket: TicketRow, actor: SupportActor) {
  return (
    ticket.ownerId === actor.id &&
    (ticket.currentOwnerId === actor.id ||
      (!!ticket.archivedAt && ticket.archivedOwnerId === actor.id))
  );
}
export function assertSupportOwner(ticket: TicketRow, actor: SupportActor) {
  if (ticket.ownerId !== actor.id || ticket.currentOwnerId !== actor.id)
    throw new ForbiddenException('SUPPORT_OWNER_REQUIRED');
}
export function assertSupportStaff(actor: SupportActor, permission: string) {
  if (
    !actor.permissions.includes('support:read') ||
    !actor.permissions.includes(permission)
  )
    throw new ForbiddenException('SUPPORT_SCOPE_DENIED');
}
