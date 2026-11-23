import type { SupportTicketSummary } from "@shared/types";
import { ArrowUpRight, Inbox, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { supportTicketPath } from "@/shared/lib/routes/support";
import { useSupportTranslation } from "../../lib/useSupportTranslation";
import { SupportStatusBadge } from "../ticket/SupportStatusBadge";

export function SupportTicketList({
  tickets,
  staff,
  compact = false,
  selected,
  backTo,
  onSelect,
  previewPath,
}: {
  tickets: SupportTicketSummary[];
  staff: boolean;
  compact?: boolean;
  selected: string;
  backTo: string;
  onSelect?: (id: string) => void;
  previewPath?: (id: string) => string;
}) {
  const { t, i18n } = useSupportTranslation();
  if (!tickets.length)
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center text-text-secondary">
        <Inbox size={28} aria-hidden="true" />
        <p className="text-sm">{t("empty")}</p>
      </div>
    );
  return (
    <div className="divide-y divide-border-subtle">
      {tickets.map((ticket) => (
        <Link
          key={ticket.id}
          to={previewPath?.(ticket.id) ?? supportTicketPath(ticket.id, staff)}
          state={{ supportBackTo: backTo }}
          onClick={(event) => {
            if (
              onSelect &&
              event.button === 0 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              event.preventDefault();
              onSelect(ticket.id);
            }
          }}
          aria-current={selected === ticket.id ? "page" : undefined}
          className={`group block p-4 transition-colors hover:bg-primary/5 focus-visible:outline focus-visible:outline-primary ${selected === ticket.id ? "bg-primary/10" : ""}`}
        >
          <div
            className={
              compact
                ? "space-y-3"
                : "grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(160px,0.45fr)_auto]"
            }
          >
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="min-w-0 break-words text-sm font-semibold text-text-primary">
                  {ticket.subject}
                </span>
                {!!ticket.unreadCount && (
                  <span
                    aria-label={t("unreadReplies", {
                      count: ticket.unreadCount,
                    })}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-xs text-primary"
                  >
                    <MessageSquare size={12} aria-hidden="true" />
                    {ticket.unreadCount}
                  </span>
                )}
              </div>
              <p className="break-words text-xs text-text-secondary">
                {ticket.serviceName}{" "}
                <span className="break-all">· {ticket.serviceId}</span>
              </p>
              {staff && (
                <p className="text-xs text-text-secondary">
                  {ticket.ownerName} · {t("assignee")}:{" "}
                  {ticket.assignedStaffName ?? t("unassigned")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <SupportStatusBadge status={ticket.status} />
              {ticket.archivedAt ? (
                <p className="text-xs text-text-secondary">{t("archived")}</p>
              ) : (
                ["OPEN", "IN_PROGRESS"].includes(ticket.status) && (
                  <p
                    className={`text-xs ${ticket.waitingFor === "CLIENT" ? "text-amber-400" : "text-text-secondary"}`}
                  >
                    {t(
                      ticket.waitingFor === "CLIENT"
                        ? staff
                          ? "waitingClient"
                          : "waitingYou"
                        : "waitingStaff",
                    )}
                  </p>
                )
              )}
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-text-secondary">
              <time dateTime={ticket.updatedAt}>
                {new Date(ticket.updatedAt).toLocaleString(i18n.language, {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </time>
              {!compact && (
                <ArrowUpRight
                  size={16}
                  className="shrink-0 text-primary"
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
