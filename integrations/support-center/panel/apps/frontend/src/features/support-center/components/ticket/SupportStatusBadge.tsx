import type { SupportTicketStatus } from "@shared/types";
import { useSupportTranslation } from "../../lib/useSupportTranslation";
import { supportStatusStyles } from "../../config/supportStatusStyles";

export function SupportStatusBadge({
  status,
}: {
  status: SupportTicketStatus;
}) {
  const { t } = useSupportTranslation();
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-lg border px-2.5 py-1 text-xs font-medium ${supportStatusStyles[status]}`}
    >
      {t(`status_${status}`)}
    </span>
  );
}
