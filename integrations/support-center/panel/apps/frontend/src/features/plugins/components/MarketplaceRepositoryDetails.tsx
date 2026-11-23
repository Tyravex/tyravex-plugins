import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { ArrowLeft, Blocks, Loader2, RefreshCw } from "lucide-react";

import type {
  MarketplacePlugin,
  MarketplaceRepository,
  NativeMarketplaceCatalog,
} from "@shared/types";

import { marketplaceApi } from "../api/marketplaceApi";
import { NativeMarketplacePluginCard } from "./NativeMarketplacePluginCard";

interface MarketplaceRepositoryDetailsProps {
  repository: MarketplaceRepository;
  onBack: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function MarketplaceRepositoryDetails({
  repository,
  onBack,
}: MarketplaceRepositoryDetailsProps) {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([]);
  const [nativeCatalog, setNativeCatalog] =
    useState<NativeMarketplaceCatalog>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setPlugins([]);
    setNativeCatalog(undefined);

    void marketplaceApi
      .listRepositoryPlugins(repository.id, controller.signal, refreshIndex > 0)
      .then((registry) => {
        if (!controller.signal.aborted) {
          setPlugins(registry.plugins);
          setNativeCatalog(
            repository.isOfficial ? registry.nativeCatalog : undefined,
          );
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            getErrorMessage(
              requestError,
              t("adminPlugins.repositories.pluginsError"),
            ),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [repository.id, repository.isOfficial, refreshIndex, t]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm hover:bg-white/5"
        >
          <ArrowLeft size={16} />
          {t("adminPlugins.repositories.back")}
        </button>

        <button
          type="button"
          onClick={() => setRefreshIndex((value) => value + 1)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {t("adminPlugins.repositories.refreshPlugins")}
        </button>
      </div>

      <section className="rounded-xl border border-border-subtle p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{repository.name}</h2>

          {repository.isOfficial && (
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400">
              {t("adminPlugins.repositories.official")}
            </span>
          )}

          <span
            className={[
              "rounded-full border px-2.5 py-1 text-xs font-medium",
              repository.status === "ENABLED"
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-red-500/30 bg-red-500/10 text-red-400",
            ].join(" ")}
          >
            {repository.status === "ENABLED"
              ? t("common.enabled")
              : t("common.disabled")}
          </span>
        </div>

        <p className="mt-3 break-all text-sm text-slate-400">
          {repository.url}
        </p>
      </section>

      <section className="rounded-xl border border-border-subtle p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              {t("adminPlugins.repositories.pluginsTitle")}
            </h3>

            <p className="mt-1 text-sm text-slate-400">
              {t("adminPlugins.repositories.pluginsHelp")}
            </p>
          </div>

          {!loading && !error && (
            <span className="text-sm text-slate-400">
              {t("adminPlugins.categories.count", {
                count: plugins.length + (nativeCatalog?.plugins.length ?? 0),
              })}
            </span>
          )}
        </div>

        {loading ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"
          >
            <Loader2 size={18} className="animate-spin" />
            {t("adminPlugins.repositories.pluginsLoading")}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
          >
            <p className="font-medium">
              {t("adminPlugins.repositories.pluginsError")}
            </p>
            <p className="mt-2 break-words">{error}</p>
          </div>
        ) : plugins.length === 0 && !nativeCatalog?.plugins.length ? (
          <div className="rounded-lg border border-dashed border-border-subtle px-4 py-12 text-center text-sm text-slate-400">
            {t("adminPlugins.repositories.pluginsEmpty")}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {nativeCatalog?.plugins.map((plugin) => (
              <NativeMarketplacePluginCard key={plugin.id} plugin={plugin} />
            ))}
            {plugins.map((plugin) => (
              <article
                key={plugin.id}
                className="rounded-lg border border-border-subtle p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg border border-border-subtle p-2">
                    <Blocks size={20} aria-hidden="true" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">{plugin.name}</h4>

                      <span className="rounded-full border border-border-subtle px-2 py-0.5 text-xs text-slate-400">
                        v{plugin.version}
                      </span>
                    </div>

                    <p className="mt-1 break-all text-xs text-slate-500">
                      {plugin.id}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm text-slate-400">
                  {plugin.description}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-lg border border-border-subtle px-2.5 py-1 text-xs text-slate-400">
                    {t(`adminPlugins.types.${plugin.type}`, {
                      defaultValue: plugin.type,
                    })}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
