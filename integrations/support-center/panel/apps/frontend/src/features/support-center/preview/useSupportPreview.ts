import { useState } from "react";
import type {
  SupportGrant,
  SupportScope,
  SupportTicket,
  SupportTicketStatus,
} from "@shared/types";

export const PREVIEW_OWNER = 101;
export const PREVIEW_STAFF = 202;
const service = { id: "preview-discord-service", name: "Discord Bot" };
export function createSupportPreview(
  t: (key: string) => string,
): SupportTicket[] {
  const now = new Date().toISOString();
  return [
    {
      id: "11111111-1111-4111-8111-111111111111",
      subject: t("sampleSubject"),
      serviceId: service.id,
      serviceName: service.name,
      ownerId: PREVIEW_OWNER,
      ownerName: "client",
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: "preview-message",
          authorId: PREVIEW_OWNER,
          authorName: "client",
          body: t("sampleMessage"),
          createdAt: now,
        },
      ],
      grants: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          staffId: PREVIEW_STAFF,
          staffName: "support",
          reason: t("sampleReason"),
          scopes: ["files:read", "status"],
          status: "PENDING",
          durationMinutes: 60,
          expiresAt: null,
          createdAt: now,
        },
      ],
      events: [
        {
          id: "preview-created",
          actorName: "client",
          action: "TICKET_CREATED",
          createdAt: now,
        },
        {
          id: "preview-access",
          actorName: "support",
          action: "ACCESS_REQUESTED",
          createdAt: now,
        },
      ],
    },
  ];
}

/** This isolated adapter never sends API requests or uses real service identifiers. */
export function useSupportPreview(t: (key: string) => string, staff: boolean) {
  const [tickets, setTickets] = useState(() => createSupportPreview(t));
  const [reads, setReads] = useState<Record<string, number>>({});
  const actorId = staff ? PREVIEW_STAFF : PREVIEW_OWNER;
  const actorName = staff ? "support" : "client";
  const change = (
    id: string,
    action: string,
    update: (ticket: SupportTicket) => SupportTicket,
  ) => {
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === id
          ? {
              ...update(ticket),
              updatedAt: new Date().toISOString(),
              events: [
                {
                  id: crypto.randomUUID(),
                  actorName,
                  action,
                  createdAt: new Date().toISOString(),
                },
                ...ticket.events,
              ],
            }
          : ticket,
      ),
    );
  };
  return {
    tickets: tickets.map((ticket) => {
      const publicMessages = ticket.messages.filter(
        (message) => !message.internal,
      );
      const unreadCount = publicMessages.filter(
        (message, index) =>
          message.authorId !== actorId &&
          index + 1 > (reads[actorId + ":" + ticket.id] ?? 0),
      ).length;
      return {
        ...ticket,
        unreadCount,
        waitingFor:
          publicMessages.slice(-1)[0]?.authorId === ticket.ownerId
            ? ("STAFF" as const)
            : ("CLIENT" as const),
      };
    }),
    actorId,
    staffMembers: [
      { id: PREVIEW_STAFF, username: "support" },
      { id: 203, username: "operator" },
    ],
    services: [service],
    reset: () => {
      setTickets(createSupportPreview(t));
      setReads({});
    },
    markRead: async (id: string, messageId: string) => {
      const messages =
        tickets
          .find((ticket) => ticket.id === id)
          ?.messages.filter((message) => !message.internal) ?? [];
      const index = messages.findIndex((message) => message.id === messageId);
      if (index >= 0)
        setReads((current) => ({
          ...current,
          [actorId + ":" + id]: Math.max(
            current[actorId + ":" + id] ?? 0,
            index + 1,
          ),
        }));
    },
    claim: async (id: string) =>
      change(id, "ASSIGNED", (ticket) => ({
        ...ticket,
        status: ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status,
        assignedStaffId: PREVIEW_STAFF,
        assignedStaffName: "support",
      })),
    assign: async (id: string, staffId: number | null) =>
      change(id, staffId === null ? "UNASSIGNED" : "ASSIGNED", (ticket) => ({
        ...ticket,
        assignedStaffId: staffId,
        assignedStaffName:
          staffId === null
            ? null
            : staffId === PREVIEW_STAFF
              ? "support"
              : "operator",
      })),
    note: async (id: string, body: string) =>
      change(id, "NOTE_ADDED", (ticket) => ({
        ...ticket,
        messages: [
          ...ticket.messages,
          {
            id: crypto.randomUUID(),
            authorId: actorId,
            authorName: actorName,
            body,
            internal: true,
            createdAt: new Date().toISOString(),
          },
        ],
      })),
    create: async (body: {
      serviceId: string;
      subject: string;
      body: string;
    }) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      setTickets((current) => [
        {
          id,
          subject: body.subject,
          serviceId: service.id,
          serviceName: service.name,
          ownerId: PREVIEW_OWNER,
          ownerName: "client",
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
          messages: [
            {
              id: crypto.randomUUID(),
              authorId: PREVIEW_OWNER,
              authorName: "client",
              body: body.body,
              createdAt: now,
            },
          ],
          grants: [],
          events: [
            {
              id: crypto.randomUUID(),
              actorName,
              action: "TICKET_CREATED",
              createdAt: now,
            },
          ],
        },
        ...current,
      ]);
      return { id };
    },
    message: async (id: string, body: string) =>
      change(id, "MESSAGE_ADDED", (ticket) => ({
        ...ticket,
        messages: [
          ...ticket.messages,
          {
            id: crypto.randomUUID(),
            authorId: actorId,
            authorName: actorName,
            body,
            createdAt: new Date().toISOString(),
          },
        ],
      })),
    status: async (id: string, status: SupportTicketStatus) =>
      change(id, `STATUS_${status}`, (ticket) => ({
        ...ticket,
        status,
        grants: ticket.grants.map((grant) =>
          ["CLOSED", "RESOLVED"].includes(status) &&
          ["PENDING", "ACTIVE"].includes(grant.status)
            ? { ...grant, status: "REVOKED" }
            : grant,
        ),
      })),
    requestAccess: async (
      id: string,
      body: { reason: string; scopes: SupportScope[]; durationMinutes: number },
    ) =>
      change(id, "ACCESS_REQUESTED", (ticket) => ({
        ...ticket,
        grants: [
          {
            ...body,
            id: crypto.randomUUID(),
            staffId: PREVIEW_STAFF,
            staffName: "support",
            status: "PENDING",
            expiresAt: null,
            createdAt: new Date().toISOString(),
          },
          ...ticket.grants,
        ],
      })),
    grantAccess: async (
      id: string,
      body: {
        staffId: number;
        reason: string;
        scopes: SupportScope[];
        durationMinutes: number;
      },
    ) =>
      change(id, "ACCESS_GRANTED_BY_OWNER", (ticket) => ({
        ...ticket,
        grants: [
          {
            ...body,
            id: crypto.randomUUID(),
            staffName: ticket.assignedStaffName ?? "support",
            status: "ACTIVE",
            expiresAt: new Date(
              Date.now() + body.durationMinutes * 60000,
            ).toISOString(),
            createdAt: new Date().toISOString(),
          },
          ...ticket.grants,
        ],
      })),
    decide: async (
      id: string,
      grantId: string,
      decision: "APPROVE" | "REJECT" | "REVOKE",
    ) => {
      const status: SupportGrant["status"] =
        decision === "APPROVE"
          ? "ACTIVE"
          : decision === "REJECT"
            ? "REJECTED"
            : "REVOKED";
      change(id, `ACCESS_${status}`, (ticket) => ({
        ...ticket,
        grants: ticket.grants.map((grant) =>
          grant.id === grantId
            ? {
                ...grant,
                status,
                expiresAt:
                  decision === "APPROVE"
                    ? new Date(
                        Date.now() + grant.durationMinutes * 60000,
                      ).toISOString()
                    : grant.expiresAt,
              }
            : grant,
        ),
      }));
    },
  };
}
