import type { SupportTicket } from "@shared/types";

export function supportTicket(
  overrides: Partial<SupportTicket> = {},
): SupportTicket {
  return {
    id: "ticket",
    subject: "Startup issue",
    serviceId: "service",
    serviceName: "Bot",
    ownerId: 1,
    ownerName: "client",
    status: "OPEN",
    createdAt: "2026-11-22T10:00:00Z",
    updatedAt: "2026-11-22T10:00:00Z",
    messages: [],
    grants: [],
    events: [],
    ...overrides,
  };
}
