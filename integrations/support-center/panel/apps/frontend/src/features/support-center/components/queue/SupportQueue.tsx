import type { SupportTicketFilters } from "@shared/types";
import type { SupportCenterModel } from "../../model/support-center.model";
import { useSupportTranslation } from "../../lib/useSupportTranslation";
import { SupportQueueFilters } from "../SupportQueueFilters";
import { SupportStatusFilters } from "./SupportStatusFilters";
import { SupportTicketList } from "./SupportTicketList";

export function SupportQueue({
  model,
  filters,
  onFilters,
  staff,
  compact,
  selected,
  backTo,
  onSelect,
  previewPath,
}: {
  model: SupportCenterModel;
  filters: SupportTicketFilters;
  onFilters: (filters: SupportTicketFilters) => void;
  staff: boolean;
  compact: boolean;
  selected: string;
  backTo: string;
  onSelect?: (id: string) => void;
  previewPath?: (id: string) => string;
}) {
  const { t } = useSupportTranslation();
  const page = filters.page ?? 1,
    limit = filters.limit ?? 25;
  return (
    <section aria-label={t("tickets")} className="min-w-0 space-y-4">
      <SupportStatusFilters
        counts={model.counts}
        selected={filters.status}
        onChange={(status) => onFilters({ ...filters, status, page: 1 })}
      />
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <SupportQueueFilters
          value={filters}
          onChange={onFilters}
          staff={staff}
          services={model.services}
          members={model.staffMembers}
          compact={compact}
        />
        <div
          className={
            compact ? "max-h-[min(65vh,720px)] overflow-y-auto" : undefined
          }
        >
          <SupportTicketList
            tickets={model.tickets}
            staff={staff}
            compact={compact}
            selected={selected}
            backTo={backTo}
            onSelect={onSelect}
            previewPath={previewPath}
          />
        </div>
        <nav
          aria-label={t("pagination")}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3 text-xs text-text-secondary"
        >
          <span>{t("pageSummary", { page, total: model.total })}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={model.loading || page <= 1}
              onClick={() => onFilters({ ...filters, page: page - 1 })}
              className="rounded-lg border border-border-subtle px-3 py-2 disabled:opacity-40"
            >
              {t("previousPage")}
            </button>
            <button
              type="button"
              disabled={model.loading || page * limit >= model.total}
              onClick={() => onFilters({ ...filters, page: page + 1 })}
              className="rounded-lg border border-border-subtle px-3 py-2 disabled:opacity-40"
            >
              {t("nextPage")}
            </button>
          </div>
        </nav>
      </div>
    </section>
  );
}
