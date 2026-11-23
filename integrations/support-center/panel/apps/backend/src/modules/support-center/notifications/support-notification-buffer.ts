import type { Notification } from '@prisma/client';
import type { Tx } from '../support-context';

const buffers = new WeakMap<Tx, Notification[]>();

export function beginSupportNotifications(tx: Tx) {
  const notifications: Notification[] = [];
  buffers.set(tx, notifications);
  return notifications;
}

export function bufferSupportNotification(tx: Tx, notification: Notification) {
  buffers.get(tx)?.push(notification);
}
