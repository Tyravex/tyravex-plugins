import type { SupportTicketFilters, SupportTicketStatus } from "@shared/types";

const statuses: SupportTicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];
const filterKeys = ["q", "status", "serviceId", "assignee", "unread", "page"];

export function readSupportQueueParams(
  params: URLSearchParams,
): SupportTicketFilters {
  const status = params.get("status") as SupportTicketStatus;
  const rawPage = Number(params.get("page") ?? 1);
  const assignee = params.get("assignee") ?? "all";
  return {
    page:
      Number.isSafeInteger(rawPage) && rawPage > 0
        ? Math.min(rawPage, 100000)
        : 1,
    q: (params.get("q") ?? "").slice(0, 160),
    status: statuses.includes(status) ? status : "",
    serviceId: (params.get("serviceId") ?? "").slice(0, 100),
    assignee: /^(all|me|unassigned|[1-9][0-9]{0,8})$/.test(assignee)
      ? assignee
      : "all",
    unread: params.get("unread") === "true",
  };
}

export function writeSupportQueueParams(
  current: URLSearchParams,
  filters: SupportTicketFilters,
) {
  const next = new URLSearchParams(current);
  for (const key of filterKeys) next.delete(key);
  if (filters.q) next.set("q", filters.q);
  if (filters.status) next.set("status", filters.status);
  if (filters.serviceId) next.set("serviceId", filters.serviceId);
  if (filters.assignee && filters.assignee !== "all")
    next.set("assignee", filters.assignee);
  if (filters.unread) next.set("unread", "true");
  if (filters.page && filters.page > 1) next.set("page", String(filters.page));
  return next;
}
