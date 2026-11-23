import type { SupportTicketFilters } from "@shared/types";
import { useSupportTranslation } from "../lib/useSupportTranslation";

export function SupportQueueFilters({
  value,
  onChange,
  staff,
  services,
  members,
  compact = false,
}: {
  value: SupportTicketFilters;
  onChange: (value: SupportTicketFilters) => void;
  staff: boolean;
  services: Array<{ id: string; name: string }>;
  members: Array<{ id: number; username: string }>;
  compact?: boolean;
}) {
  const { t } = useSupportTranslation();
  const inputClass =
    "w-full rounded-xl border border-border-subtle bg-background p-3 text-sm";
  return (
    <div
      className={`grid gap-3 border-b border-border-subtle p-4 ${compact ? "" : staff ? "sm:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_minmax(140px,0.6fr)_minmax(140px,0.6fr)_auto]" : "sm:grid-cols-[minmax(200px,1fr)_minmax(160px,0.6fr)_auto]"}`}
    >
      <input
        aria-label={t("search")}
        placeholder={t("search")}
        value={value.q ?? ""}
        onChange={(event) =>
          onChange({ ...value, q: event.target.value, page: 1 })
        }
        className={inputClass}
      />
      <select
        aria-label={t("service")}
        value={value.serviceId ?? ""}
        onChange={(event) =>
          onChange({ ...value, serviceId: event.target.value, page: 1 })
        }
        className={inputClass}
      >
        <option value="">{t("allServices")}</option>
        {services.map((service) => (
          <option key={service.id} value={service.id}>
            {service.name}
          </option>
        ))}
      </select>
      {staff && (
        <select
          aria-label={t("assigneeFilter")}
          value={value.assignee ?? "all"}
          onChange={(event) =>
            onChange({ ...value, assignee: event.target.value, page: 1 })
          }
          className={inputClass}
        >
          <option value="all">{t("allAssignees")}</option>
          <option value="me">{t("assignedToMe")}</option>
          <option value="unassigned">{t("unassigned")}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.username}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={!!value.unread}
          onChange={(event) =>
            onChange({ ...value, unread: event.target.checked, page: 1 })
          }
        />
        {t("onlyUnread")}
      </label>
    </div>
  );
}
