import { Prisma } from '@prisma/client';
import type {
  SupportMessage,
  SupportEvent,
  SupportPage,
  SupportTicketList,
  SupportTicketSummary,
} from '@shared/types';
import type { SupportActor, Tx } from '../support-context';
import type { SupportListQueryDto } from './support-workflow.dto';

const counts = () => ({ OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 });
function joins(actor: SupportActor) {
  return Prisma.sql`
  FROM plugin_support_center.tickets t LEFT JOIN "Service" s ON s.id=t.service_id JOIN "User" u ON u.id=t.owner_id
  LEFT JOIN "User" a ON a.id=t.assigned_staff_id
  LEFT JOIN plugin_support_center.reads r ON r.ticket_id=t.id AND r.user_id=${actor.id}`;
}
function unread(actor: SupportActor) {
  return Prisma.sql`(SELECT count(*)::int FROM plugin_support_center.messages m
  WHERE m.ticket_id=t.id AND NOT m.is_internal AND m.author_id IS DISTINCT FROM ${actor.id} AND m.sequence>COALESCE(r.last_sequence,0))`;
}
function filters(
  actor: SupportActor,
  staff: boolean,
  query: SupportListQueryDto,
  status = true,
) {
  const parts = [
    Prisma.sql`(${staff} OR (t.owner_id=${actor.id} AND (s."userId"=${actor.id} OR (t.archived_at IS NOT NULL AND t.archived_owner_id=${actor.id}))))`,
  ];
  if (status && query.status) parts.push(Prisma.sql`t.status=${query.status}`);
  if (query.serviceId)
    parts.push(Prisma.sql`t.service_snapshot_id=${query.serviceId}`);
  if (query.q?.trim()) {
    const pattern = `%${query.q.trim().replace(/[\\%_]/g, '\\$&')}%`;
    parts.push(
      Prisma.sql`(t.subject ILIKE ${pattern} OR COALESCE(s.name,t.service_name) ILIKE ${pattern} OR t.service_snapshot_id ILIKE ${pattern} OR t.id::text ILIKE ${pattern})`,
    );
  }
  if (query.assignee === 'me')
    parts.push(Prisma.sql`t.assigned_staff_id=${actor.id}`);
  else if (query.assignee === 'unassigned')
    parts.push(Prisma.sql`t.assigned_staff_id IS NULL`);
  else if (query.assignee && query.assignee !== 'all')
    parts.push(Prisma.sql`t.assigned_staff_id=${Number(query.assignee)}`);
  if (query.unread === 'true') parts.push(Prisma.sql`${unread(actor)}>0`);
  return Prisma.join(parts, ' AND ');
}

export async function listSupportTickets(
  tx: Tx,
  actor: SupportActor,
  staff: boolean,
  query: SupportListQueryDto,
): Promise<SupportTicketList> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const rows = await tx.$queryRaw<SupportTicketSummary[]>(Prisma.sql`
    SELECT t.id::text,t.subject,t.status,t.service_snapshot_id AS "serviceId",COALESCE(s.name,t.service_name) AS "serviceName",t.archived_at AS "archivedAt",u.username AS "ownerName",t.updated_at AS "updatedAt",
      t.assigned_staff_id AS "assignedStaffId",a.username AS "assignedStaffName",${unread(actor)} AS "unreadCount",
      CASE WHEN (SELECT m.author_id FROM plugin_support_center.messages m WHERE m.ticket_id=t.id AND NOT m.is_internal ORDER BY m.sequence DESC LIMIT 1)=t.owner_id THEN 'STAFF' ELSE 'CLIENT' END AS "waitingFor"
    ${joins(actor)} WHERE ${filters(actor, staff, query)} ORDER BY t.updated_at DESC,t.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`);
  const total = await tx.$queryRaw<Array<{ count: number }>>(
    Prisma.sql`SELECT count(*)::int AS count ${joins(actor)} WHERE ${filters(actor, staff, query)}`,
  );
  const grouped = await tx.$queryRaw<
    Array<{ status: keyof ReturnType<typeof counts>; count: number }>
  >(
    Prisma.sql`SELECT t.status,count(*)::int AS count ${joins(actor)} WHERE ${filters(actor, staff, query, false)} GROUP BY t.status`,
  );
  const summary = counts();
  for (const row of grouped) summary[row.status] = row.count;
  return {
    items: rows,
    total: total[0]?.count ?? 0,
    page,
    limit,
    counts: summary,
  };
}

export async function supportUnreadCounts(
  tx: Tx,
  actor: SupportActor,
  staff: boolean,
) {
  const rows = await tx.$queryRaw<
    Array<{ tickets: number; messages: number }>
  >(Prisma.sql`
    SELECT count(*) FILTER (WHERE ${unread(actor)}>0)::int AS tickets,COALESCE(sum(${unread(actor)}),0)::int AS messages
    ${joins(actor)} WHERE ${filters(actor, staff, {})}`);
  return rows[0] ?? { tickets: 0, messages: 0 };
}

export async function supportMessagesPage(
  tx: Tx,
  ticketId: string,
  internal: boolean,
  before?: string,
  limit = 50,
): Promise<SupportPage<SupportMessage>> {
  const cursor = before
    ? Prisma.sql`AND m.sequence<(SELECT c.sequence FROM plugin_support_center.messages c WHERE c.id=${before}::uuid AND c.ticket_id=${ticketId}::uuid AND (NOT c.is_internal OR ${internal}))`
    : Prisma.empty;
  const rows = await tx.$queryRaw<
    SupportMessage[]
  >(Prisma.sql`SELECT m.id::text,m.author_id AS "authorId",m.author_name AS "authorName",m.body,m.created_at AS "createdAt",m.is_internal AS internal,m.sequence::text
    FROM plugin_support_center.messages m WHERE m.ticket_id=${ticketId}::uuid AND (NOT m.is_internal OR ${internal}) ${cursor} ORDER BY m.sequence DESC LIMIT ${limit + 1}`);
  const items = rows.slice(0, limit);
  return {
    items: [...items].reverse(),
    nextCursor: rows.length > limit ? items.at(-1)!.id : null,
  };
}
export async function supportEventsPage(
  tx: Tx,
  ticketId: string,
  internal: boolean,
  before?: string,
  limit = 25,
): Promise<SupportPage<SupportEvent>> {
  const cursor = before
    ? Prisma.sql`AND (e.created_at,e.id)<(SELECT c.created_at,c.id FROM plugin_support_center.events c WHERE c.id=${before}::uuid AND c.ticket_id=${ticketId}::uuid AND (NOT c.is_internal OR ${internal}))`
    : Prisma.empty;
  const rows = await tx.$queryRaw<
    SupportEvent[]
  >(Prisma.sql`SELECT e.id::text,e.actor_name AS "actorName",e.action,e.created_at AS "createdAt",e.target_name AS "targetName",e.request_id::text AS "requestId",e.operation,e.outcome,e.error_code AS "errorCode",e.finished_at AS "finishedAt"
    FROM plugin_support_center.events e WHERE e.ticket_id=${ticketId}::uuid AND (NOT e.is_internal OR ${internal}) ${cursor} ORDER BY e.created_at DESC,e.id DESC LIMIT ${limit + 1}`);
  return {
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1].id : null,
  };
}
