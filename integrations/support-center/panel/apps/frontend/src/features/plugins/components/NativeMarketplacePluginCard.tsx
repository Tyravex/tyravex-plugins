import type { NativeMarketplacePlugin } from "@shared/types";
import { ExternalLink, Package } from "lucide-react";
import { useSupportTranslation } from "@/features/support-center/lib/useSupportTranslation";
import { SupportPluginCard } from "@/features/support-center/components/SupportPluginCard";

export function NativeMarketplacePluginCard({
  plugin,
}: {
  plugin: NativeMarketplacePlugin;
}) {
  const { t } = useSupportTranslation();
  if (plugin.id === "tyravex.support-center")
    return <SupportPluginCard publication={plugin} compact />;
  return (
    <article className="space-y-3 rounded-xl border border-border-subtle bg-surface p-4">
      <h4 className="flex items-center gap-2 font-semibold">
        <Package size={18} aria-hidden="true" />
        {plugin.name}
      </h4>
      <p className="break-all font-mono text-xs text-text-secondary">
        {plugin.id}
      </p>
      <p className="text-sm text-text-secondary">
        {t("publishedVersion", {
          version: plugin.publishedVersion ?? t("versionUnknown"),
        })}
      </p>
      <p className="text-sm text-amber-400">{t("nativeBuildRequired")}</p>
      <a
        href={`${plugin.repositoryUrl}/tree/main/${plugin.path}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-primary"
      >
        {t("sourceRepository")}
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </article>
  );
}
