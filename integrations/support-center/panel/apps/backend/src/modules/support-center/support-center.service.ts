import { SupportMutationService } from './mutations/support-mutation.service';
import {
  assertSupportStatusTransition,
  assertSupportTicketCapacity,
} from './workflow/support-status.policy';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { supportAccessStaffWhere } from './access/support-staff.policy';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { SupportTicket, SupportGrant } from '@shared/types';
import { ServiceWorkspaceBroker } from '@/modules/services/workspace/service-workspace.broker';
import type {
  CreateSupportTicketDto,
  SupportAccessRequestDto,
  SupportWorkspaceDto,
} from './support-center.dto';
import {
  authorizeSupportWorkspace,
  lockSupportPlugin,
} from './access/support-access.policy';

import {
  loadSupportTicket,
  assertSupportOwner,
  mayReadSupportAsOwner,
  assertSupportStaff,
  type SupportActor,
  type Tx,
} from './support-context';
export type { SupportActor } from './support-context';
import { supportEvent } from './support-activity';
import {
  supportNotify,
  supportNotifyStaff,
} from './notifications/support-notifications';
import {
  requireSupportWorkflow,
  supportWorkflowReady,
  mayReadInternalNotes,
} from './workflow/support-workflow.policy';
import {
  listSupportTickets,
  supportMessagesPage,
  supportEventsPage,
} from './workflow/support-ticket.queries';
import type {
  SupportListQueryDto,
  SupportViewQueryDto,
} from './workflow/support-workflow.dto';

@Injectable()
export class SupportCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: ServiceWorkspaceBroker,
    private readonly mutations: SupportMutationService,
  ) {}
  async availability() {
    const plugin = await this.prisma.plugin.findFirst({
      where: {
        id: 'tyravex.support-center',
        status: 'INSTALLED',
        storagePath: 'native/tyravex.support-center',
      },
      select: { id: true },
    });
    if (!plugin) return { enabled: false, ready: false };
    const ready = await this.prisma.$transaction(async (tx) => {
      await lockSupportPlugin(tx);
      return supportWorkflowReady(tx);
    });
    return { enabled: true, ready };
  }
  private async enabled(tx: Tx) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "Plugin" WHERE id = 'tyravex.support-center' AND status = 'INSTALLED' AND "storagePath" = 'native/tyravex.support-center' FOR SHARE`;
    if (!rows.length) throw new ForbiddenException('SUPPORT_DISABLED');
  }
  private event = supportEvent;
  private notify = supportNotify;
  private notifyStaff = supportNotifyStaff;
  private ticket = loadSupportTicket;
  private owner = assertSupportOwner;
  private staff = assertSupportStaff;
  async list(
    actor: SupportActor,
    staff: boolean,
    query: SupportListQueryDto = {},
  ) {
    if (staff) this.staff(actor, 'support:read');
    return this.prisma.$transaction(async (tx) => {
      await this.enabled(tx);
      await requireSupportWorkflow(tx);
      return listSupportTickets(tx, actor, staff, query);
    });
  }
  async services(actor: SupportActor, staff = false) {
    if (staff) {
      this.staff(actor, 'support:read');
      return this.prisma.$transaction(async (tx) => {
        await this.enabled(tx);
        await requireSupportWorkflow(tx);
        return tx.$queryRaw<
          Array<{ id: string; name: string }>
        >`SELECT DISTINCT s.id,s.name FROM "Service" s JOIN plugin_support_center.tickets t ON t.service_id=s.id ORDER BY s.name LIMIT 1000`;
      });
    }
    return this.prisma.service.findMany({
      where: { userId: actor.id },
      select: { id: true, name: true },
      take: 100,
      orderBy: { name: 'asc' },
    });
  }
  async detail(
    id: string,
    actor: SupportActor,
    query: SupportViewQueryDto = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.enabled(tx);
      const ticket = await this.ticket(tx, id, actor);
      if (ticket.ownerId === actor.id && !mayReadSupportAsOwner(ticket, actor))
        throw new NotFoundException('SUPPORT_NOT_FOUND');
      await requireSupportWorkflow(tx);
      const staffView = query.staff === 'true';
      if (staffView) this.staff(actor, 'support:read');
      const includeInternal = mayReadInternalNotes(ticket, actor, staffView);
      const messagesPage = await supportMessagesPage(tx, id, includeInternal);
      const details = await tx.$queryRaw<
        Array<{
          assignedStaffId: number | null;
          assignedStaffName: string | null;
        }>
      >`SELECT t.assigned_staff_id AS "assignedStaffId",u.username AS "assignedStaffName" FROM plugin_support_center.tickets t LEFT JOIN "User" u ON u.id=t.assigned_staff_id WHERE t.id=${id}::uuid`;
      const assignedStaffCanAccess =
        !!details[0]?.assignedStaffId &&
        !!(await tx.user.findFirst({
          where: supportAccessStaffWhere(details[0].assignedStaffId),
          select: { id: true },
        }));
      const grants = await tx.$queryRaw<
        SupportGrant[]
      >`SELECT id::text,staff_id AS "staffId",staff_name AS "staffName",reason,scopes,
        CASE WHEN status='ACTIVE' AND expires_at<=now() THEN 'EXPIRED' ELSE status END AS status,
        duration_minutes AS "durationMinutes",expires_at AS "expiresAt",created_at AS "createdAt"
        FROM plugin_support_center.grants WHERE ticket_id=${id}::uuid ORDER BY created_at DESC LIMIT 100`;
      const eventsPage = await supportEventsPage(tx, id, includeInternal);
      const { currentOwnerId, archivedOwnerId, ...safe } = ticket;
      return {
        ...safe,
        ...details[0],
        assignedStaffCanAccess,
        messages: messagesPage.items,
        messagesNextCursor: messagesPage.nextCursor,
        grants,
        events: eventsPage.items,
        eventsNextCursor: eventsPage.nextCursor,
      };
    });
  }
  async create(actor: SupportActor, dto: CreateSupportTicketDto, key?: string) {
    if (!dto.subject.trim() || !dto.body.trim())
      throw new BadRequestException('SUPPORT_INVALID_INPUT');
    return this.mutations.run(
      actor,
      'create',
      dto,
      async (tx) => {
        await this.enabled(tx);
        await tx.$queryRaw`SELECT id FROM "Service" WHERE id=${dto.serviceId} FOR UPDATE`;
        const service = await tx.service.findFirst({
          where: { id: dto.serviceId, userId: actor.id },
          select: { id: true },
        });
        if (!service) throw new NotFoundException('SUPPORT_SERVICE_NOT_FOUND');
        await requireSupportWorkflow(tx);
        await assertSupportTicketCapacity(tx, actor.id);
        const id = randomUUID();
        await tx.$executeRaw`INSERT INTO plugin_support_center.tickets(id,service_id,owner_id,subject) VALUES (${id}::uuid,${dto.serviceId},${actor.id},${dto.subject.trim()})`;
        await tx.$executeRaw`INSERT INTO plugin_support_center.messages(id,ticket_id,author_id,author_name,body) VALUES (${randomUUID()}::uuid,${id}::uuid,${actor.id},${actor.username},${dto.body.trim()})`;
        await this.event(tx, id, actor, 'TICKET_CREATED');
        await this.notifyStaff(tx, id, actor.id, 'TICKET_CREATED');
        return { id };
      },
      key,
    );
  }
  async message(id: string, actor: SupportActor, body: string, key?: string) {
    if (!body.trim()) throw new BadRequestException('SUPPORT_INVALID_INPUT');
    return this.mutations.run(
      actor,
      'message',
      { id, body },
      async (tx) => {
        await this.enabled(tx);
        const ticket = await this.ticket(tx, id, actor, true);
        if (actor.id === ticket.ownerId) this.owner(ticket, actor);
        else this.staff(actor, 'support:manage');
        if (['RESOLVED', 'CLOSED'].includes(ticket.status))
          throw new ConflictException('SUPPORT_TICKET_CLOSED');
        await tx.$executeRaw`INSERT INTO plugin_support_center.messages(id,ticket_id,author_id,author_name,body) VALUES (${randomUUID()}::uuid,${id}::uuid,${actor.id},${actor.username},${body.trim()})`;
        await tx.$executeRaw`UPDATE plugin_support_center.tickets SET updated_at=now() WHERE id=${id}::uuid`;
        await this.event(tx, id, actor, 'MESSAGE_ADDED');
        if (actor.id !== ticket.ownerId)
          await this.notify(tx, ticket.ownerId, id, 'MESSAGE_ADDED');
        else await this.notifyStaff(tx, id, actor.id, 'MESSAGE_ADDED');
        return { ok: true };
      },
      key,
    );
  }
  async changeStatus(
    id: string,
    actor: SupportActor,
    status: string,
    key?: string,
  ) {
    return this.mutations.run(
      actor,
      'status',
      { id, status },
      async (tx) => {
        await this.enabled(tx);
        const ticket = await this.ticket(tx, id, actor, true);
        if (
          actor.id === ticket.ownerId &&
          ['OPEN', 'CLOSED'].includes(status)
        ) {
          this.owner(ticket, actor);
        } else this.staff(actor, 'support:manage');
        assertSupportStatusTransition(ticket.status, status);
        if (ticket.status === status) return { ok: true };
        if (['RESOLVED', 'CLOSED'].includes(ticket.status) && status === 'OPEN')
          await assertSupportTicketCapacity(tx, ticket.ownerId);
        await tx.$executeRaw`UPDATE plugin_support_center.tickets SET status=${status},updated_at=now() WHERE id=${id}::uuid`;
        if (['RESOLVED', 'CLOSED'].includes(status))
          await tx.$executeRaw`UPDATE plugin_support_center.grants SET status='REVOKED' WHERE ticket_id=${id}::uuid AND status IN ('PENDING','ACTIVE')`;
        await this.event(tx, id, actor, `STATUS_${status}`);
        if (actor.id !== ticket.ownerId)
          await this.notify(
            tx,
            ticket.ownerId,
            id,
            `STATUS_${status}` as import('@shared/types').SupportNotificationEvent,
          );
        else
          await this.notifyStaff(
            tx,
            id,
            actor.id,
            `STATUS_${status}` as import('@shared/types').SupportNotificationEvent,
          );
        return { ok: true };
      },
      key,
    );
  }
  async requestAccess(
    id: string,
    actor: SupportActor,
    dto: SupportAccessRequestDto,
    key?: string,
  ) {
    this.staff(actor, 'support:access');
    if (
      dto.reason.trim().length < 10 ||
      (dto.scopes.includes('secrets') &&
        !dto.scopes.some((s) => s.startsWith('files:')))
    )
      throw new BadRequestException('SUPPORT_INVALID_INPUT');
    return this.mutations.run(
      actor,
      'access',
      { id, dto },
      async (tx) => {
        await this.enabled(tx);
        const ticket = await this.ticket(tx, id, actor, true);
        if (
          actor.id === ticket.ownerId ||
          ticket.ownerId !== ticket.currentOwnerId ||
          !['OPEN', 'IN_PROGRESS'].includes(ticket.status)
        )
          throw new ConflictException('SUPPORT_TICKET_CLOSED');
        const pending = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM plugin_support_center.grants WHERE ticket_id=${id}::uuid AND staff_id=${actor.id} AND (status='PENDING' OR (status='ACTIVE' AND expires_at>now()))`;
        if (pending.length)
          throw new ConflictException('SUPPORT_ACCESS_EXISTS');
        await tx.$executeRaw`INSERT INTO plugin_support_center.grants(id,ticket_id,staff_id,staff_name,reason,scopes,duration_minutes)
        VALUES (${randomUUID()}::uuid,${id}::uuid,${actor.id},${actor.username},${dto.reason.trim()},${dto.scopes}::text[],${dto.durationMinutes})`;
        await this.event(tx, id, actor, 'ACCESS_REQUESTED');
        await this.notify(tx, ticket.ownerId, id, 'ACCESS_REQUESTED');
        return { ok: true };
      },
      key,
    );
  }
  async decide(
    id: string,
    grantId: string,
    actor: SupportActor,
    decision: string,
    key?: string,
  ) {
    return this.mutations.run(
      actor,
      'decision',
      { id, grantId, decision },
      async (tx) => {
        await this.enabled(tx);
        const ticket = await this.ticket(tx, id, actor, true);
        const rows = await tx.$queryRaw<
          Array<{ staffId: number; status: string; duration: number }>
        >`SELECT staff_id AS "staffId",status,duration_minutes AS duration FROM plugin_support_center.grants WHERE id=${grantId}::uuid AND ticket_id=${id}::uuid FOR UPDATE`;
        const grant = rows[0];
        if (!grant) throw new NotFoundException('SUPPORT_NOT_FOUND');
        if (actor.id === ticket.ownerId) this.owner(ticket, actor);
        else if (decision !== 'REVOKE' || grant.staffId !== actor.id)
          throw new ForbiddenException('SUPPORT_OWNER_REQUIRED');
        if (
          decision === 'APPROVE' &&
          (!['OPEN', 'IN_PROGRESS'].includes(ticket.status) ||
            grant.status !== 'PENDING')
        )
          throw new ConflictException('SUPPORT_ACCESS_INACTIVE');
        if (decision === 'REJECT' && grant.status !== 'PENDING')
          throw new ConflictException('SUPPORT_ACCESS_INACTIVE');
        if (
          decision === 'REVOKE' &&
          !['PENDING', 'ACTIVE'].includes(grant.status)
        )
          throw new ConflictException('SUPPORT_ACCESS_INACTIVE');
        const next =
          decision === 'APPROVE'
            ? 'ACTIVE'
            : decision === 'REJECT'
              ? 'REJECTED'
              : 'REVOKED';
        await tx.$executeRaw`UPDATE plugin_support_center.grants SET status=${next},expires_at=CASE WHEN ${next}='ACTIVE' THEN now()+make_interval(mins=>duration_minutes) ELSE expires_at END WHERE id=${grantId}::uuid`;
        await this.event(tx, id, actor, `ACCESS_${next}`);
        await this.notify(
          tx,
          actor.id === ticket.ownerId ? grant.staffId : ticket.ownerId,
          id,
          `ACCESS_${next}` as import('@shared/types').SupportNotificationEvent,
        );
        return { ok: true };
      },
      key,
    );
  }
  async execute(id: string, actor: SupportActor, dto: SupportWorkspaceDto) {
    this.staff(actor, 'support:access');
    const service = await this.prisma.$transaction(async (tx) => {
      await this.enabled(tx);
      await requireSupportWorkflow(tx);
      return this.ticket(tx, id, actor);
    });
    const result = await this.workspace.execute(
      actor.id,
      service.serviceId,
      dto.operation,
      dto.args,
      false,
      undefined,
      { ticketId: id, grantId: dto.grantId },
    );
    // Do not release file contents if consent expired or was revoked while the agent was working.
    await this.prisma.$transaction(async (tx) => {
      await lockSupportPlugin(tx);
      await tx.$queryRaw`SELECT id FROM "Service" WHERE id=${service.serviceId} FOR SHARE`;
      await authorizeSupportWorkspace(
        tx,
        actor.id,
        service.serviceId,
        dto.operation,
        dto.args,
        { ticketId: id, grantId: dto.grantId },
        false,
      );
    });
    if (dto.operation === 'runtime.status') {
      // A status-only grant must not expose application logs, which may contain credentials.
      return Object.fromEntries(
        ['running', 'measuredAt', 'memoryBytes', 'cpuPercent', 'diskBytes']
          .filter((key) => key in result)
          .map((key) => [key, result[key]]),
      );
    }
    return result;
  }
}
