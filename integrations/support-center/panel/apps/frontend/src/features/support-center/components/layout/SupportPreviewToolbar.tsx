import { RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { useSupportTranslation } from "../../lib/useSupportTranslation";

export function SupportPreviewToolbar({
  staff,
  onPerspective,
  reset,
}: {
  staff: boolean;
  onPerspective: (staff: boolean) => void;
  reset: () => void;
}) {
  const { t } = useSupportTranslation();
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3">
      <p className="text-xs leading-5 text-text-secondary">
        {t("previewNote")}
      </p>
      <div className="flex flex-wrap gap-2">
        {[false, true].map((value) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={staff === value}
            onClick={() => onPerspective(value)}
            className={`rounded-lg px-3 py-2 text-xs ${staff === value ? "bg-primary/15 text-primary" : "border border-border-subtle"}`}
          >
            {t(value ? "staffView" : "clientView")}
          </button>
        ))}
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-xs"
        >
          <RotateCcw size={14} />
          {t("reset")}
        </button>
        <Link
          to="/admin/plugins/marketplace"
          className="px-3 py-2 text-xs text-primary"
        >
          {t("back")}
        </Link>
      </div>
    </section>
  );
}
