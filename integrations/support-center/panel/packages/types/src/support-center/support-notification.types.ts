export const SUPPORT_NOTIFICATION_EVENTS = [
  "TICKET_CREATED",
  "MESSAGE_ADDED",
  "ASSIGNED",
  "UNASSIGNED",
  "STATUS_OPEN",
  "STATUS_IN_PROGRESS",
  "STATUS_RESOLVED",
  "STATUS_CLOSED",
  "ACCESS_REQUESTED",
  "ACCESS_ACTIVE",
  "ACCESS_REJECTED",
  "ACCESS_REVOKED",
  "ACCESS_GRANTED_BY_OWNER",
] as const;
export type SupportNotificationEvent =
  (typeof SUPPORT_NOTIFICATION_EVENTS)[number];

export interface SupportNotificationPayload {
  ticketId: string;
  serviceId: string;
  serviceName: string;
  staff: boolean;
  event: SupportNotificationEvent;
}
