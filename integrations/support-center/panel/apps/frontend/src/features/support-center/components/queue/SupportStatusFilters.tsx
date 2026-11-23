import type { SupportTicketFilters, SupportTicketStatus } from "@shared/types";
import { useSupportTranslation } from "../../lib/useSupportTranslation";
import { supportStatusStyles } from "../../config/supportStatusStyles";

export function SupportStatusFilters({
  counts,
  selected,
  onChange,
}: {
  counts: Record<string, number>;
  selected: SupportTicketFilters["status"];
  onChange: (status: SupportTicketFilters["status"]) => void;
}) {
  const { t } = useSupportTranslation();
  const statuses: SupportTicketStatus[] = [
    "OPEN",
    "IN_PROGRESS",
    "RESOLVED",
    "CLOSED",
  ];
  const total = statuses.reduce(
    (sum, status) => sum + (counts[status] ?? 0),
    0,
  );
  return (
    <div
      role="group"
      aria-label={t("statusFilters")}
      className="flex flex-wrap gap-2"
    >
      {(["", ...statuses] as const).map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={(selected ?? "") === status}
          onClick={() => onChange(status)}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-shadow ${status ? supportStatusStyles[status] : "border-border-subtle bg-surface text-text-secondary"} ${(selected ?? "") === status ? "ring-2 ring-current ring-offset-2 ring-offset-background" : "hover:ring-1 hover:ring-current"}`}
        >
          <span>{t(status ? `status_${status}` : "allTickets")}</span>
          <span className="rounded-md bg-background/60 px-1.5 py-0.5 text-xs tabular-nums">
            {status ? (counts[status] ?? 0) : total}
          </span>
        </button>
      ))}
    </div>
  );
}
