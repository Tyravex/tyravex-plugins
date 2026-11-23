import { SupportMutationService } from '../mutations/support-mutation.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  assertSupportOwner,
  loadSupportTicket,
  type SupportActor,
} from '../support-context';
import { supportNotify } from '../notifications/support-notifications';
import { requireSupportWorkflow } from '../workflow/support-workflow.policy';
import { lockSupportPlugin } from './support-access.policy';
import type { SupportOwnerAccessDto } from './support-consent.dto';
import { supportAccessStaffWhere } from './support-staff.policy';

@Injectable()
export class SupportConsentService {
  constructor(private readonly mutations: SupportMutationService) {}

  async grantToAssignee(
    id: string,
    actor: SupportActor,
    dto: SupportOwnerAccessDto,
    key?: string,
  ) {
    if (
      dto.reason.trim().length < 10 ||
      (dto.scopes.includes('secrets') &&
        !dto.scopes.some((scope) => scope.startsWith('files:')))
    ) {
      throw new BadRequestException('SUPPORT_INVALID_INPUT');
    }
    return this.mutations.run(
      actor,
      'access',
      { id, dto },
      async (tx) => {
        await lockSupportPlugin(tx);
        await requireSupportWorkflow(tx);
        const ticket = await loadSupportTicket(tx, id, actor, true);
        assertSupportOwner(ticket, actor);
        if (!['OPEN', 'IN_PROGRESS'].includes(ticket.status))
          throw new ConflictException('SUPPORT_TICKET_CLOSED');
        const assigned = await tx.$queryRaw<
          Array<{ staffId: number | null }>
        >`SELECT assigned_staff_id AS "staffId" FROM plugin_support_center.tickets WHERE id=${id}::uuid`;
        // Confirm the assignee displayed when the owner opened the form, never a silently changed recipient.
        if (!assigned[0]?.staffId || assigned[0].staffId !== dto.staffId)
          throw new ConflictException('SUPPORT_ASSIGNEE_CHANGED');
        if (dto.staffId === actor.id)
          throw new BadRequestException('SUPPORT_SELF_ACCESS_DENIED');
        const staff = await tx.user.findFirst({
          where: supportAccessStaffWhere(dto.staffId),
          select: { username: true },
        });
        if (!staff)
          throw new BadRequestException('SUPPORT_STAFF_ACCESS_REQUIRED');
        const current = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM plugin_support_center.grants WHERE ticket_id=${id}::uuid AND staff_id=${dto.staffId} AND (status='PENDING' OR (status='ACTIVE' AND expires_at>clock_timestamp()))`;
        if (current.length)
          throw new ConflictException('SUPPORT_ACCESS_EXISTS');
        await tx.$executeRaw`INSERT INTO plugin_support_center.grants(id,ticket_id,staff_id,staff_name,reason,scopes,status,duration_minutes,expires_at)
        VALUES (${randomUUID()}::uuid,${id}::uuid,${dto.staffId},${staff.username},${dto.reason.trim()},${dto.scopes}::text[],'ACTIVE',${dto.durationMinutes},now()+make_interval(mins=>${dto.durationMinutes}))`;
        await tx.$executeRaw`INSERT INTO plugin_support_center.events(id,ticket_id,actor_id,actor_name,action,target_name) VALUES (${randomUUID()}::uuid,${id}::uuid,${actor.id},${actor.username},'ACCESS_GRANTED_BY_OWNER',${staff.username})`;
        await supportNotify(tx, dto.staffId, id, 'ACCESS_GRANTED_BY_OWNER');
        return { ok: true };
      },
      key,
    );
  }
}
