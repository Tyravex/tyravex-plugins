import { SupportMutationService } from '../mutations/support-mutation.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SupportActiveAccess } from '@shared/types';
import { PrismaService } from '@/prisma/prisma.service';
import { lockSupportPlugin } from '../access/support-access.policy';
import {
  assertSupportStaff,
  mayReadSupportAsOwner,
  loadSupportTicket,
  type SupportActor,
} from '../support-context';
import { supportEvent } from '../support-activity';
import { supportNotify } from '../notifications/support-notifications';
import {
  mayReadInternalNotes,
  requireSupportWorkflow,
} from './support-workflow.policy';
import {
  supportEventsPage,
  supportMessagesPage,
  supportUnreadCounts,
} from './support-ticket.queries';
import type { SupportCursorQueryDto } from './support-workflow.dto';

@Injectable()
export class SupportWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mutations: SupportMutationService,
  ) {}
  async staffList(actor: SupportActor) {
    assertSupportStaff(actor, 'support:read');
    return this.prisma.$transaction(async (tx) => {
      await lockSupportPlugin(tx);
      await requireSupportWorkflow(tx);
      return tx.user.findMany({
        where: {
          isActive: true,
          AND: ['support:read', 'support:manage'].map((name) => ({
            roles: { some: { role: { permissions: { some: { name } } } } },
          })),
        },
        select: { id: true, username: true },
        take: 100,
        orderBy: { username: 'asc' },
      });
    });
  }
  async assign(
    id: string,
    actor: SupportActor,
    staffId: number | null,
    claim = false,
    key?: string,
  ) {
    assertSupportStaff(actor, 'support:manage');
    return this.mutations.run(
      actor,
      'assign',
      { id, staffId, claim },
      async (tx) => {
        await lockSupportPlugin(tx);
        await requireSupportWorkflow(tx);
        const ticket = await loadSupportTicket(tx, id, actor, true);
        if (!['OPEN', 'IN_PROGRESS'].includes(ticket.status))
          throw new ConflictException('SUPPORT_TICKET_CLOSED');
        const current = await tx.$queryRaw<
          Array<{ staffId: number | null }>
        >`SELECT assigned_staff_id AS "staffId" FROM plugin_support_center.tickets WHERE id=${id}::uuid`;
        if (
          claim &&
          current[0].staffId !== null &&
          current[0].staffId !== actor.id
        )
          throw new ConflictException('SUPPORT_ALREADY_ASSIGNED');
        if (
          current[0].staffId === staffId &&
          !(claim && ticket.status === 'OPEN')
        )
          return { assignedStaffId: staffId };
        let name: string | null = null;
        if (staffId !== null) {
          const user = await tx.user.findFirst({
            where: {
              id: staffId,
              isActive: true,
              AND: ['support:read', 'support:manage'].map((permission) => ({
                roles: {
                  some: {
                    role: { permissions: { some: { name: permission } } },
                  },
                },
              })),
            },
            select: { username: true },
          });
          if (!user)
            throw new BadRequestException('SUPPORT_ASSIGNMENT_INVALID');
          name = user.username;
        }
        await tx.$executeRaw`UPDATE plugin_support_center.tickets SET assigned_staff_id=${staffId},updated_at=now() WHERE id=${id}::uuid`;
        await tx.$executeRaw`INSERT INTO plugin_support_center.events(id,ticket_id,actor_id,actor_name,action,target_name) VALUES (${randomUUID()}::uuid,${id}::uuid,${actor.id},${actor.username},${staffId === null ? 'UNASSIGNED' : 'ASSIGNED'},${name})`;
        if (claim && ticket.status === 'OPEN') {
          await tx.$executeRaw`UPDATE plugin_support_center.tickets SET status='IN_PROGRESS' WHERE id=${id}::uuid`;
          await supportEvent(tx, id, actor, 'STATUS_IN_PROGRESS');
          if (ticket.ownerId !== actor.id)
            await supportNotify(tx, ticket.ownerId, id, 'STATUS_IN_PROGRESS');
        }
        if (staffId !== null && staffId !== actor.id)
          await supportNotify(tx, staffId, id, 'ASSIGNED');
        if (current[0].staffId !== staffId) {
          if (ticket.ownerId !== actor.id)
            await supportNotify(
              tx,
              ticket.ownerId,
              id,
              staffId === null ? 'UNASSIGNED' : 'ASSIGNED',
            );
          if (
            current[0].staffId &&
            current[0].staffId !== actor.id &&
            current[0].staffId !== ticket.ownerId
          )
            await supportNotify(tx, current[0].staffId, id, 'UNASSIGNED');
        }
        return { assignedStaffId: staffId, assignedStaffName: name };
      },
      key,
    );
  }
  async note(id: string, actor: SupportActor, body: string, key?: string) {
    assertSupportStaff(actor, 'support:manage');
    if (!body.trim()) throw new BadRequestException('SUPPORT_INVALID_INPUT');
    return this.mutations.run(
      actor,
      'note',
      { id, body },
      async (tx) => {
        await lockSupportPlugin(tx);
        await requireSupportWorkflow(tx);
        const ticket = await loadSupportTicket(tx, id, actor, true);
        if (ticket.ownerId === actor.id)
          throw new ForbiddenException('SUPPORT_INTERNAL_DENIED');
        if (!['OPEN', 'IN_PROGRESS'].includes(ticket.status))
          throw new ConflictException('SUPPORT_TICKET_CLOSED');
        await tx.$executeRaw`INSERT INTO plugin_support_center.messages(id,ticket_id,author_id,author_name,body,is_internal) VALUES (${randomUUID()}::uuid,${id}::uuid,${actor.id},${actor.username},${body.trim()},true)`;
        await tx.$executeRaw`INSERT INTO plugin_support_center.events(id,ticket_id,actor_id,actor_name,action,is_internal) VALUES (${randomUUID()}::uuid,${id}::uuid,${actor.id},${actor.username},'NOTE_ADDED',true)`;
        // Internal notes never notify the client or change the public waiting state/read marker.
        await tx.$executeRaw`UPDATE plugin_support_center.tickets SET updated_at=now() WHERE id=${id}::uuid`;
        return { ok: true };
      },
      key,
    );
  }
  async markRead(id: string, actor: SupportActor, throughMessageId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockSupportPlugin(tx);
      await requireSupportWorkflow(tx);
      const ticket = await loadSupportTicket(tx, id, actor);
      if (ticket.ownerId === actor.id && !mayReadSupportAsOwner(ticket, actor))
        throw new NotFoundException('SUPPORT_NOT_FOUND');
      const changed =
        await tx.$executeRaw`INSERT INTO plugin_support_center.reads(ticket_id,user_id,last_sequence)
        SELECT ${id}::uuid,${actor.id},m.sequence FROM plugin_support_center.messages m WHERE m.id=${throughMessageId}::uuid AND m.ticket_id=${id}::uuid AND NOT m.is_internal
        ON CONFLICT(ticket_id,user_id) DO UPDATE SET last_sequence=GREATEST(plugin_support_center.reads.last_sequence,EXCLUDED.last_sequence)`;
      if (!changed) throw new BadRequestException('SUPPORT_INVALID_INPUT');
      return { ok: true };
    });
  }
  async unread(actor: SupportActor, staff: boolean) {
    if (staff) assertSupportStaff(actor, 'support:read');
    return this.prisma.$transaction(async (tx) => {
      await lockSupportPlugin(tx);
      await requireSupportWorkflow(tx);
      return supportUnreadCounts(tx, actor, staff);
    });
  }
  async page(
    id: string,
    actor: SupportActor,
    query: SupportCursorQueryDto,
    kind: 'messages' | 'events',
  ) {
    const staff = query.staff === 'true';
    if (staff) assertSupportStaff(actor, 'support:read');
    return this.prisma.$transaction(async (tx) => {
      await lockSupportPlugin(tx);
      await requireSupportWorkflow(tx);
      const ticket = await loadSupportTicket(tx, id, actor);
      if (ticket.ownerId === actor.id && !mayReadSupportAsOwner(ticket, actor))
        throw new NotFoundException('SUPPORT_NOT_FOUND');
      const internal = mayReadInternalNotes(ticket, actor, staff);
      return kind === 'messages'
        ? supportMessagesPage(tx, id, internal, query.before, query.limit)
        : supportEventsPage(tx, id, internal, query.before, query.limit);
    });
  }
  async activeAccess(serviceId: string, actor: SupportActor) {
    return this.prisma.$transaction(async (tx) => {
      await lockSupportPlugin(tx);
      await requireSupportWorkflow(tx);
      // Keep ownership stable until the consent list has been read.
      await tx.$queryRaw`SELECT id FROM "Service" WHERE id=${serviceId} FOR SHARE`;
      const service = await tx.service.findFirst({
        where: { id: serviceId, userId: actor.id },
        select: { id: true },
      });
      if (!service) throw new NotFoundException('SUPPORT_SERVICE_NOT_FOUND');
      return tx.$queryRaw<
        SupportActiveAccess[]
      >`SELECT g.id::text,g.ticket_id::text AS "ticketId",g.staff_id AS "staffId",g.staff_name AS "staffName",g.reason,g.scopes,g.status,g.duration_minutes AS "durationMinutes",g.expires_at AS "expiresAt",g.created_at AS "createdAt"
        FROM plugin_support_center.grants g JOIN plugin_support_center.tickets t ON t.id=g.ticket_id
        WHERE t.service_id=${serviceId} AND t.owner_id=${actor.id} AND t.status IN ('OPEN','IN_PROGRESS') AND g.status='ACTIVE' AND g.expires_at>clock_timestamp() ORDER BY g.expires_at LIMIT 100`;
    });
  }
}
