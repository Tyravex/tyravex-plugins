import { postSupportMutation } from "./supportMutation";
import { api } from "@/shared/api/client";
import type {
  FunctionalPluginManifest,
  SupportScope,
  SupportTicket,
  SupportTicketStatus,
  PluginRoleCandidate,
  SupportTicketList,
  SupportTicketFilters,
  SupportPage,
  SupportMessage,
  SupportEvent,
  SupportActiveAccess,
} from "@shared/types";

export type { SupportTicketSummary } from "@shared/types";
export interface LocalPlugin {
  manifest: FunctionalPluginManifest;
  source: "LOCAL";
  published: false;
  installed: { status: string; version: string } | null;
}
export const supportCenterApi = {
  staffList: async () =>
    (await api.get<Array<{ id: number; username: string }>>("/support/staff"))
      .data,
  claim: async (id: string) =>
    postSupportMutation(`/support/tickets/${id}/claim`),
  assign: async (id: string, staffId: number | null) =>
    postSupportMutation(`/support/tickets/${id}/assignee`, { staffId }),
  note: async (id: string, body: string) =>
    postSupportMutation(`/support/tickets/${id}/notes`, { body }),
  markRead: async (id: string, throughMessageId: string) =>
    api.post(`/support/tickets/${id}/read`, { throughMessageId }),
  unread: async (staff: boolean) =>
    (
      await api.get<{ tickets: number; messages: number }>("/support/unread", {
        params: { staff },
      })
    ).data,
  messages: async (id: string, staff: boolean, before?: string) =>
    (
      await api.get<SupportPage<SupportMessage>>(
        `/support/tickets/${id}/messages`,
        { params: { staff, before } },
      )
    ).data,
  events: async (id: string, staff: boolean, before?: string) =>
    (
      await api.get<SupportPage<SupportEvent>>(
        `/support/tickets/${id}/events`,
        { params: { staff, before } },
      )
    ).data,
  activeAccess: async (id: string) =>
    (
      await api.get<SupportActiveAccess[]>(
        `/support/services/${encodeURIComponent(id)}/access`,
      )
    ).data,
  upgrade: async (id: string, confirmation: string) =>
    (await api.post(`/admin/local-plugins/${id}/upgrade`, { confirmation }))
      .data,
  roleCandidates: async () =>
    (
      await api.get<PluginRoleCandidate[]>(
        "/admin/local-plugins/tyravex.support-center/role-candidates",
      )
    ).data,
  bindRole: async (roleId: string, confirmation: string) =>
    (
      await api.post(
        "/admin/local-plugins/tyravex.support-center/managed-role",
        { roleId, confirmation },
      )
    ).data,
  enableTicketRole: async (roleId: string, confirmation: string) =>
    (
      await api.post(
        "/admin/local-plugins/tyravex.support-center/ticket-role",
        { roleId, confirmation },
      )
    ).data,
  localCatalog: async () =>
    (await api.get<LocalPlugin[]>("/admin/local-plugins")).data,
  availability: async () =>
    (
      await api.get<{ enabled: boolean; ready?: boolean }>(
        "/support/availability",
      )
    ).data,
  install: async (id: string, confirmation: string) =>
    (await api.post(`/admin/local-plugins/${id}/install`, { confirmation }))
      .data,
  uninstall: async (id: string, confirmation: string, deleteData: boolean) =>
    (
      await api.post(`/admin/local-plugins/${id}/uninstall`, {
        confirmation,
        deleteData,
      })
    ).data,
  list: async (staff: boolean, filters: SupportTicketFilters = {}) =>
    (
      await api.get<SupportTicketList>("/support/tickets", {
        params: {
          staff,
          ...filters,
          status: filters.status || undefined,
          unread: filters.unread || undefined,
        },
      })
    ).data,
  services: async (staff = false) =>
    (
      await api.get<Array<{ id: string; name: string }>>("/support/services", {
        params: { staff },
      })
    ).data,
  detail: async (id: string, staff = false) =>
    (
      await api.get<SupportTicket>(`/support/tickets/${id}`, {
        params: { staff },
      })
    ).data,
  create: async (body: { serviceId: string; subject: string; body: string }) =>
    (await postSupportMutation<{ id: string }>("/support/tickets", body)).data,
  message: async (id: string, body: string) =>
    postSupportMutation(`/support/tickets/${id}/messages`, { body }),
  status: async (id: string, status: SupportTicketStatus) =>
    postSupportMutation(`/support/tickets/${id}/status`, { status }),
  requestAccess: async (
    id: string,
    body: { reason: string; scopes: SupportScope[]; durationMinutes: number },
  ) => postSupportMutation(`/support/tickets/${id}/access`, body),
  grantAccess: async (
    id: string,
    body: {
      staffId: number;
      reason: string;
      scopes: SupportScope[];
      durationMinutes: number;
    },
  ) => postSupportMutation(`/support/tickets/${id}/owner-access`, body),
  decide: async (
    id: string,
    grantId: string,
    decision: "APPROVE" | "REJECT" | "REVOKE",
  ) =>
    postSupportMutation(`/support/tickets/${id}/access/${grantId}`, {
      decision,
    }),
  workspace: async (
    id: string,
    body: { grantId: string; operation: string; args: Record<string, unknown> },
  ) =>
    (
      await api.post<Record<string, unknown>>(
        `/support/tickets/${id}/workspace`,
        body,
        { timeout: 60000 },
      )
    ).data,
};
