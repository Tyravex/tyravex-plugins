import { Check, Play, RotateCcw, X } from "lucide-react";
import type { SupportTicket } from "@shared/types";
import type { SupportCenterModel } from "../../model/support-center.model";
import { useSupportTranslation } from "../../lib/useSupportTranslation";

export function SupportTicketActions({
  ticket,
  model,
  staff,
}: {
  ticket: SupportTicket;
  model: SupportCenterModel;
  staff: boolean;
}) {
  const { t } = useSupportTranslation();
  const open = ["OPEN", "IN_PROGRESS"].includes(ticket.status);
  if (ticket.archivedAt || (staff && !model.canManage)) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {staff && ticket.status === "OPEN" && (
        <button
          type="button"
          disabled={model.busy}
          onClick={() =>
            void model.run(() =>
              ticket.assignedStaffId
                ? model.operations.status(ticket.id, "IN_PROGRESS")
                : model.operations.claim(ticket.id),
            )
          }
          className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-3 py-2 text-sm disabled:opacity-40"
        >
          <Play size={15} aria-hidden="true" />
          {t("start")}
        </button>
      )}
      {staff && open && (
        <button
          type="button"
          disabled={model.busy}
          onClick={() =>
            void model.run(() => model.operations.status(ticket.id, "RESOLVED"))
          }
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-3 py-2 text-sm text-emerald-400 disabled:opacity-40"
        >
          <Check size={16} aria-hidden="true" />
          {t("resolve")}
        </button>
      )}
      <button
        type="button"
        disabled={model.busy}
        onClick={() =>
          void model.run(() =>
            model.operations.status(ticket.id, open ? "CLOSED" : "OPEN"),
          )
        }
        className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-3 py-2 text-sm disabled:opacity-40"
      >
        {open ? (
          <X size={15} aria-hidden="true" />
        ) : (
          <RotateCcw size={15} aria-hidden="true" />
        )}
        {t(open ? "close" : "reopen")}
      </button>
    </div>
  );
}
