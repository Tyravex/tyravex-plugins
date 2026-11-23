import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export interface SupportWorkspaceAccess {
  ticketId: string;
  grantId: string;
}
export interface StoredSupportWorkspaceAccess extends SupportWorkspaceAccess {
  ownerId: number;
  auditVersion?: 2;
}
export interface ActiveSupportGrant {
  status: string;
  expiresAt: Date | null;
  scopes: string[];
  staffId: number;
  ownerId: number;
  currentOwnerId: number | null;
  ticketStatus: string;
}

export function checkSupportGrant(
  grant: ActiveSupportGrant,
  actorId: number,
  operation: string,
  args: Record<string, unknown>,
  now = new Date(),
) {
  if (
    grant.staffId !== actorId ||
    grant.status !== 'ACTIVE' ||
    !grant.expiresAt ||
    grant.expiresAt <= now ||
    grant.ownerId !== grant.currentOwnerId ||
    !['OPEN', 'IN_PROGRESS'].includes(grant.ticketStatus)
  ) {
    throw new ForbiddenException('SUPPORT_ACCESS_INACTIVE');
  }
  const scope =
    operation === 'runtime.status'
      ? 'status'
      : ['files.list', 'files.read'].includes(operation)
        ? 'files:read'
        : operation === 'files.write'
          ? 'files:write'
          : null;
  if (!scope || !grant.scopes.includes(scope))
    throw new ForbiddenException('SUPPORT_SCOPE_DENIED');
  if (operation === 'files.read' || operation === 'files.write') {
    // Access to known secret files is a separate, explicit consent. Source code may also contain secrets.
    const path = typeof args.path === 'string' ? args.path : '';
    const sensitive = path
      .split('/')
      .some(
        (part) =>
          part.startsWith('.') ||
          /(?:^|[._-])(env|secret|credentials?|tokens?|passwords?|private)(?:$|[._-])/i.test(
            part,
          ) ||
          /\.(?:pem|key|p12|pfx|keystore)$/i.test(part),
      );
    if (sensitive && !grant.scopes.includes('secrets'))
      throw new ForbiddenException('SUPPORT_SECRETS_DENIED');
  }
}

/** Called inside the broker transaction after locking the service; no administrative bypass. */
export async function lockSupportPlugin(tx: Prisma.TransactionClient) {
  const plugin = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "Plugin" WHERE id = 'tyravex.support-center' AND status = 'INSTALLED' AND "storagePath" = 'native/tyravex.support-center' FOR SHARE`;
  if (!plugin.length) throw new ForbiddenException('SUPPORT_DISABLED');
}

export async function authorizeSupportWorkspace(
  tx: Prisma.TransactionClient,
  actorId: number,
  serviceId: string,
  operation: string,
  args: Record<string, unknown>,
  access: SupportWorkspaceAccess,
  record = true,
  requestId?: string,
) {
  await lockSupportPlugin(tx);
  const staff = await tx.user.findFirst({
    where: {
      id: actorId,
      isActive: true,
      AND: ['support:access', 'support:read'].map((name) => ({
        roles: { some: { role: { permissions: { some: { name } } } } },
      })),
    },
    select: { id: true },
  });
  if (!staff) throw new ForbiddenException('SUPPORT_SCOPE_DENIED');
  const grants = await tx.$queryRaw<ActiveSupportGrant[]>`
    SELECT g.status, g.expires_at AS "expiresAt", g.scopes, g.staff_id AS "staffId",
      t.owner_id AS "ownerId", s."userId" AS "currentOwnerId", t.status AS "ticketStatus"
    FROM plugin_support_center.grants g JOIN plugin_support_center.tickets t ON t.id = g.ticket_id
    JOIN "Service" s ON s.id = t.service_id
    WHERE g.id = ${access.grantId}::uuid AND t.id = ${access.ticketId}::uuid AND t.service_id = ${serviceId}
      AND g.expires_at > clock_timestamp()
    FOR UPDATE OF t, g`;
  if (!grants.length) throw new NotFoundException('SUPPORT_NOT_FOUND');
  checkSupportGrant(grants[0], actorId, operation, args);
  if (record)
    await tx.$executeRaw`INSERT INTO plugin_support_center.events (id, ticket_id, actor_id, actor_name, action,request_id,operation,outcome)
    SELECT ${randomUUID()}::uuid, ${access.ticketId}::uuid, id, username, ${`WORKSPACE_${operation.replace('.', '_').toUpperCase()}`},${requestId ?? null}::uuid,${operation},'PENDING' FROM "User" WHERE id = ${actorId}`;
}
