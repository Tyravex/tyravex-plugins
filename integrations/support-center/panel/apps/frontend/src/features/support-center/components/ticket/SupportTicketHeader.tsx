import type { SupportTicket } from "@shared/types";
import type { SupportCenterModel } from "../../model/support-center.model";
import { useSupportTranslation } from "../../lib/useSupportTranslation";
import { SupportStatusBadge } from "./SupportStatusBadge";
import { SupportTicketActions } from "./SupportTicketActions";

export function SupportTicketHeader({
  ticket,
  model,
  staff,
}: {
  ticket: SupportTicket;
  model: SupportCenterModel;
  staff: boolean;
}) {
  const { t } = useSupportTranslation();
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="break-all font-mono text-xs text-text-secondary">
            #{ticket.id}
          </p>
          <h2 className="break-words text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
            {ticket.subject}
          </h2>
          <p className="break-words text-sm text-text-secondary">
            {ticket.serviceName}{" "}
            <span className="break-all text-xs">— {ticket.serviceId}</span>
          </p>
        </div>
        <SupportStatusBadge status={ticket.status} />
      </div>
      <SupportTicketActions ticket={ticket} model={model} staff={staff} />
      {ticket.archivedAt && (
        <p
          role="status"
          className="rounded-xl border border-border-subtle bg-surface p-3 text-sm leading-6 text-text-secondary"
        >
          {t("archivedTicketHelp")}
        </p>
      )}
      {staff && ticket.ownerId === model.actorId && (
        <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm leading-6 text-text-secondary">
          {t("staffOwnTicketHelp")}
        </p>
      )}
    </header>
  );
}
