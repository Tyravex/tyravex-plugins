import type { SupportTicketStatus } from "@shared/types";

export const supportStatusStyles: Record<SupportTicketStatus, string> = {
  OPEN: "border-amber-400/30 bg-amber-400/10 text-amber-500",
  IN_PROGRESS: "border-sky-400/30 bg-sky-400/10 text-sky-500",
  RESOLVED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-500",
  CLOSED: "border-rose-400/30 bg-rose-400/10 text-rose-500",
};
