import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/app/store/auth.store";
import { supportCenterApi } from "../api/supportCenterApi";
import { useSupportAvailability } from "./useSupportAvailability";
import { useSupportTranslation } from "../lib/useSupportTranslation";
import { supportError } from "../lib/supportError";
import { useSupportPreview } from "../preview/useSupportPreview";
import type { SupportTicketFilters } from "@shared/types";
import { refreshCurrentUser } from "@/features/auth/model/refreshCurrentUser";
import { useSupportUpdates } from "./useSupportUpdates";

export function useSupportCenter(
  preview: boolean,
  staff: boolean,
  selectedId: string,
  filters: SupportTicketFilters = {},
  options: { listEnabled?: boolean } = {},
) {
  useSupportUpdates();
  const { t } = useSupportTranslation();
  const client = useQueryClient();
  const actor = useAuthStore((state) => state.user);
  const availability = useSupportAvailability(!preview);
  const mock = useSupportPreview(t, staff);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enabled =
    !preview &&
    !!availability.data?.enabled &&
    availability.data.ready !== false;
  const list = useQuery({
    queryKey: ["support-tickets", actor?.id, staff, filters],
    queryFn: () => supportCenterApi.list(staff, filters),
    enabled: enabled && options.listEnabled !== false,
    retry: false,
    refetchInterval: (query) => (query.state.error ? false : 20000),
  });
  const detail = useQuery({
    queryKey: ["support-ticket", actor?.id, selectedId, staff],
    queryFn: () => supportCenterApi.detail(selectedId, staff),
    enabled: enabled && !!selectedId,
    retry: false,
    refetchInterval: (query) => (query.state.error ? false : 20000),
  });
  const services = useQuery({
    queryKey: ["support-services", actor?.id, staff],
    queryFn: () => supportCenterApi.services(staff),
    enabled: enabled && options.listEnabled !== false,
    retry: false,
  });
  const staffMembers = useQuery({
    queryKey: ["support-staff", actor?.id],
    queryFn: supportCenterApi.staffList,
    enabled: enabled && staff,
    retry: false,
  });
  const previewTickets = mock.tickets.filter(
    (ticket) =>
      (!filters.status || ticket.status === filters.status) &&
      (!filters.q ||
        `${ticket.subject} ${ticket.serviceName} ${ticket.serviceId}`
          .toLowerCase()
          .includes(filters.q.toLowerCase())) &&
      (!filters.serviceId || ticket.serviceId === filters.serviceId) &&
      (!filters.unread || !!ticket.unreadCount) &&
      (!filters.assignee ||
        filters.assignee === "all" ||
        (filters.assignee === "me"
          ? ticket.assignedStaffId === mock.actorId
          : filters.assignee === "unassigned"
            ? !ticket.assignedStaffId
            : ticket.assignedStaffId === Number(filters.assignee))),
  );
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 25;
  const previewTicket = mock.tickets.find((ticket) => ticket.id === selectedId);
  const run = async (
    operation: () => Promise<unknown>,
    onSuccess?: () => void,
  ) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      if (!preview) {
        await client.invalidateQueries({ queryKey: ["support-tickets"] });
        await client.invalidateQueries({ queryKey: ["support-ticket"] });
        await client.invalidateQueries({ queryKey: ["support-unread"] });
      }
      onSuccess?.();
    } catch (reason) {
      setError(supportError(reason));
    } finally {
      setBusy(false);
    }
  };
  return {
    available: preview || enabled,
    upgradeRequired:
      !preview &&
      !!availability.data?.enabled &&
      availability.data.ready === false,
    loading: !preview && (availability.isLoading || list.isLoading),
    detailLoading: !preview && detail.isLoading,
    error:
      error ||
      (!preview && (availability.isError || list.isError || detail.isError)
        ? "error"
        : ""),
    busy,
    run,
    actorId: preview ? mock.actorId : (actor?.id ?? 0),
    canManage: preview || !!actor?.permissions.includes("support:manage"),
    canRequest: preview || !!actor?.permissions.includes("support:access"),
    canAssignStaff:
      !!actor &&
      ["user:read", "role:read", "role:assign"].every((name) =>
        actor.permissions.includes(name),
      ),
    refreshPermissions: () =>
      run(async () => {
        await refreshCurrentUser();
        await client.invalidateQueries({ queryKey: ["support-availability"] });
        await client.invalidateQueries({ queryKey: ["support-staff"] });
      }),
    tickets: preview
      ? previewTickets.slice((page - 1) * limit, page * limit)
      : (list.data?.items ?? []),
    total: preview ? previewTickets.length : (list.data?.total ?? 0),
    counts: preview
      ? Object.fromEntries(
          ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((status) => [
            status,
            mock.tickets.filter((ticket) => ticket.status === status).length,
          ]),
        )
      : (list.data?.counts ?? {}),
    ticket: preview
      ? previewTicket && {
          ...previewTicket,
          messages: previewTicket.messages.filter(
            (message) =>
              !message.internal ||
              (staff && previewTicket.ownerId !== mock.actorId),
          ),
          events: previewTicket.events.filter(
            (event) =>
              event.action !== "NOTE_ADDED" ||
              (staff && previewTicket.ownerId !== mock.actorId),
          ),
        }
      : detail.data,
    services: preview ? mock.services : (services.data ?? []),
    staffMembers: preview ? mock.staffMembers : (staffMembers.data ?? []),
    operations: preview ? mock : supportCenterApi,
    reset: mock.reset,
  };
}
