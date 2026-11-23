import { Headset, LayoutList, PanelsTopLeft, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useSupportTranslation } from "../../lib/useSupportTranslation";
import type { SupportLayout } from "../../model/support-center.model";

export function SupportPageHeader({
  staff,
  preview,
  layout,
  onLayout,
  onCreate,
  busy,
  refreshPermissions,
  canAssignStaff,
}: {
  staff: boolean;
  preview: boolean;
  layout: SupportLayout;
  onLayout?: (layout: SupportLayout) => void;
  onCreate?: () => void;
  busy: boolean;
  refreshPermissions: () => void;
  canAssignStaff: boolean;
}) {
  const { t } = useSupportTranslation();
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <Headset size={22} aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">
            {t(staff ? "staffTitle" : "title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            {t(staff ? "staffDescription" : "clientDescription")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {staff && onLayout && (
          <div
            role="group"
            aria-label={t("layoutLabel")}
            className="flex rounded-xl border border-border-subtle bg-surface p-1"
          >
            {(
              [
                ["list", LayoutList],
                ["inbox", PanelsTopLeft],
              ] as const
            ).map(([value, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={layout === value}
                onClick={() => onLayout(value)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${layout === value ? "bg-primary/15 text-primary" : "text-text-secondary"}`}
              >
                <Icon size={16} aria-hidden="true" />
                {t(value === "list" ? "layoutList" : "layoutInbox")}
              </button>
            ))}
          </div>
        )}
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus size={17} aria-hidden="true" />
            {t("newTicket")}
          </button>
        )}
        {staff && !preview && (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-sm">
              {t("staffOptions")}
            </summary>
            <div className="absolute right-0 z-10 mt-2 grid min-w-56 gap-1 rounded-xl border border-border-subtle bg-surface p-2 shadow-xl">
              <button
                disabled={busy}
                type="button"
                onClick={refreshPermissions}
                className="rounded-lg px-3 py-2 text-left text-sm hover:bg-primary/10 disabled:opacity-40"
              >
                {t("refreshPermissions")}
              </button>
              {canAssignStaff && (
                <Link
                  to="/admin/users"
                  className="rounded-lg px-3 py-2 text-sm hover:bg-primary/10"
                >
                  {t("manageStaff")}
                </Link>
              )}
            </div>
          </details>
        )}
      </div>
    </header>
  );
}
