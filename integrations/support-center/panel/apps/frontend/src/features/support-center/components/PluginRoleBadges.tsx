import { Blocks, ShieldCheck, PauseCircle } from "lucide-react";
import type { PluginManagedRole } from "@shared/types";
import { useSupportTranslation } from "../lib/useSupportTranslation";

export function PluginRoleBadges({
  management,
}: {
  management: PluginManagedRole;
}) {
  const { t } = useSupportTranslation();
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-primary">
        <Blocks size={13} aria-hidden="true" />
        {t("roleFromPlugin")}
      </span>
      <span
        title={t("roleProtectionHelp")}
        className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-primary"
      >
        <ShieldCheck size={13} aria-hidden="true" />
        {t("roleProtected")}
      </span>
      {management.pluginStatus === "DISABLED" && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-amber-300">
          <PauseCircle size={13} aria-hidden="true" />
          {t("roleInactive")}
        </span>
      )}
    </div>
  );
}
