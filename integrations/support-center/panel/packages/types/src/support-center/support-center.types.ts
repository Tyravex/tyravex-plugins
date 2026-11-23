export const SUPPORT_PLUGIN_ID = "tyravex.support-center";
export const SUPPORT_NAMESPACE = "plugin.tyravex.support-center";
export const SUPPORT_SCOPES = [
  "status",
  "files:read",
  "files:write",
  "secrets",
] as const;
export type SupportScope = (typeof SUPPORT_SCOPES)[number];
export type SupportTicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED";
export type SupportGrantStatus =
  | "PENDING"
  | "ACTIVE"
  | "REJECTED"
  | "REVOKED"
  | "EXPIRED";

export interface SupportMessage {
  internal?: boolean;
  sequence?: string;
  id: string;
  authorId: number | null;
  authorName: string;
  body: string;
  createdAt: string;
}
export interface SupportGrant {
  id: string;
  staffId: number;
  staffName: string;
  reason: string;
  scopes: SupportScope[];
  status: SupportGrantStatus;
  durationMinutes: number;
  expiresAt: string | null;
  createdAt: string;
}
export interface SupportEvent {
  targetName?: string | null;
  requestId?: string | null;
  operation?: string | null;
  outcome?: "PENDING" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | null;
  errorCode?: string | null;
  finishedAt?: string | null;
  id: string;
  actorName: string;
  action: string;
  createdAt: string;
}
export interface SupportTicket {
  archivedAt?: string | null;
  assignedStaffCanAccess?: boolean;
  assignedStaffId?: number | null;
  assignedStaffName?: string | null;
  unreadCount?: number;
  waitingFor?: "STAFF" | "CLIENT";
  messagesNextCursor?: string | null;
  eventsNextCursor?: string | null;
  id: string;
  subject: string;
  serviceId: string;
  serviceName: string;
  ownerId: number;
  ownerName: string;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  messages: SupportMessage[];
  grants: SupportGrant[];
  events: SupportEvent[];
}

export interface SupportPage<T> {
  items: T[];
  nextCursor: string | null;
}
export type SupportTicketSummary = Pick<
  SupportTicket,
  | "id"
  | "subject"
  | "status"
  | "serviceId"
  | "serviceName"
  | "ownerName"
  | "updatedAt"
  | "assignedStaffId"
  | "assignedStaffName"
  | "unreadCount"
  | "waitingFor"
  | "archivedAt"
>;
export interface SupportTicketList {
  items: SupportTicketSummary[];
  total: number;
  page: number;
  limit: number;
  counts: Record<SupportTicketStatus, number>;
}
export interface SupportTicketFilters {
  page?: number;
  limit?: number;
  q?: string;
  status?: SupportTicketStatus | "";
  serviceId?: string;
  assignee?: string;
  unread?: boolean;
}
export interface SupportActiveAccess extends SupportGrant {
  ticketId: string;
}
