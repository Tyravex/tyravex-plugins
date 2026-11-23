import type { SupportNotificationEvent } from '@shared/types';
import type { Tx } from '../support-context';
import { bufferSupportNotification } from './support-notification-buffer';

export async function supportNotify(
  tx: Tx,
  userId: number,
  ticketId: string,
  event: SupportNotificationEvent,
) {
  await supportNotifyMany(tx, [userId], ticketId, event);
}

async function supportNotifyMany(
  tx: Tx,
  userIds: number[],
  ticketId: string,
  event: SupportNotificationEvent,
) {
  if (!userIds.length) return;
  // Store a locale-independent code; never copy ticket contents or secrets into notifications.
  const rows = await tx.$queryRaw<
    Array<{ serviceId: string; serviceName: string; ownerId: number }>
  >`SELECT COALESCE(t.service_id,t.service_snapshot_id) AS "serviceId",COALESCE(s.name,t.service_name) AS "serviceName",t.owner_id AS "ownerId" FROM plugin_support_center.tickets t LEFT JOIN "Service" s ON s.id=t.service_id WHERE t.id=${ticketId}::uuid`;
  if (!rows.length) return;
  const row = rows[0];
  const data = userIds.map((userId) => ({
    userId,
    content: `tyravex:support:v1:${JSON.stringify({ ticketId, serviceId: row.serviceId, serviceName: row.serviceName, staff: userId !== row.ownerId, event })}`,
  }));
  const notifications =
    data.length === 1
      ? [await tx.notification.create({ data: data[0] })]
      : await tx.notification.createManyAndReturn({ data });
  for (const notification of notifications)
    if (notification) bufferSupportNotification(tx, notification);
}
export async function supportNotifyStaff(
  tx: Tx,
  ticketId: string,
  exceptId: number,
  event: SupportNotificationEvent,
) {
  const assigned = await tx.$queryRaw<
    Array<{ staffId: number | null }>
  >`SELECT assigned_staff_id AS "staffId" FROM plugin_support_center.tickets WHERE id=${ticketId}::uuid`;
  const eligible = {
    isActive: true,
    id: { not: exceptId },
    AND: ['support:read', 'support:manage'].map((name) => ({
      roles: { some: { role: { permissions: { some: { name } } } } },
    })),
  };
  if (assigned[0]?.staffId) {
    const assignee = await tx.user.findFirst({
      where: { ...eligible, id: assigned[0].staffId },
      select: { id: true },
    });
    if (assignee && assignee.id !== exceptId) {
      await supportNotify(tx, assignee.id, ticketId, event);
      return;
    }
    if (assignee?.id === exceptId) return;
  }
  // Page the eligible queue instead of silently dropping recipients after the first 100.
  let cursor: number | undefined;
  do {
    const staff = await tx.user.findMany({
      where: {
        ...eligible,
        ...(cursor ? { id: { not: exceptId, gt: cursor } } : {}),
      },
      select: { id: true },
      take: 100,
      orderBy: { id: 'asc' },
    });
    await supportNotifyMany(
      tx,
      staff.map((member) => member.id),
      ticketId,
      event,
    );
    cursor = staff.length === 100 ? staff.at(-1)!.id : undefined;
  } while (cursor);
}
