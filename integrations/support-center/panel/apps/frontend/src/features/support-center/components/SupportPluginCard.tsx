import type { NativeMarketplacePlugin } from "@shared/types";
import { useSupportPublication } from "../hooks/useSupportPublication";
import { newerNativeVersion } from "../lib/nativePluginVersions";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Headset, Eye, Download } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SUPPORT_PLUGIN_ID } from "@shared/types";
import { useAuthStore } from "@/app/store/auth.store";
import { useUser } from "@/shared/store/user";
import { api } from "@/shared/api/client";
import { Modal } from "@/shared/ui/Modal";
import { supportCenterApi } from "../api/supportCenterApi";
import { useSupportTranslation } from "../lib/useSupportTranslation";
import { supportError } from "../lib/supportError";
import { PluginRoleBindingPanel } from "./PluginRoleBindingPanel";

export function SupportPluginCard({
  onChanged,
  publication,
  compact = false,
}: {
  onChanged?: () => void;
  publication?: NativeMarketplacePlugin | null;
  compact?: boolean;
} = {}) {
  const { t } = useSupportTranslation();
  const client = useQueryClient();
  const { entry: published, loading: publicationLoading } =
    useSupportPublication(publication);
  const actor = useAuthStore((state) => state.user);
  const [action, setAction] = useState<
    "install" | "uninstall" | "upgrade" | null
  >(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleteData, setDeleteData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["local-plugins", actor?.id],
    queryFn: supportCenterApi.localCatalog,
    retry: false,
    enabled: !!actor?.permissions.includes("plugin:read"),
  });
  const plugin = query.data?.find(
    (item) => item.manifest.id === SUPPORT_PLUGIN_ID,
  );
  const installed = plugin?.installed;
  const availableVersion =
    plugin?.manifest.version ?? published?.compiledVersion ?? null;
  const manage = !!actor?.permissions.includes("plugin:manage");
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      await client.invalidateQueries({ queryKey: ["local-plugins"] });
      await client.invalidateQueries({ queryKey: ["support-availability"] });
      const user = (await api.get("/auth/me")).data;
      useAuthStore.getState().setUser(user);
      useUser.getState().setUser(user);
      onChanged?.();
      setAction(null);
      setConfirmation("");
      setDeleteData(false);
    } catch (reason) {
      setError(supportError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
        {t("officialNative")}
      </p>
      <div className="flex flex-wrap items-start gap-4">
        <div className="rounded-2xl bg-primary/15 p-4 text-primary">
          <Headset size={30} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold">{t("title")}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t("description")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-lg px-2 py-1 ${published?.publishedVersion ? "bg-emerald-400/10 text-emerald-400" : "bg-amber-400/10 text-amber-400"}`}
            >
              {t(
                publicationLoading
                  ? "loading"
                  : published?.publishedVersion
                    ? "publishedSource"
                    : "publicationUnknown",
              )}
            </span>
            {published?.publishedVersion && (
              <span className="text-text-secondary">v{published.publishedVersion}</span>
            )}
          </div>
          {installed && (
            <p className="mt-2 text-sm text-emerald-300">
              {t(installed.status === "INSTALLED" ? "installed" : "disabled")}
            </p>
          )}
        </div>
        <Link
          to="/admin/plugins/local/support-center/preview"
          className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-4 py-2"
        >
          <Eye size={16} />
          {t("preview")}
        </Link>
      </div>
      <div className="space-y-1 text-xs text-text-secondary">
        <p>
          {t("publishedVersion", {
            version: published?.publishedVersion ?? t("versionUnknown"),
          })}
        </p>
        <p>
          {t("compiledVersion", {
            version: availableVersion ?? t("versionUnknown"),
          })}
        </p>
        {installed && (
          <p>{t("installedVersion", { version: installed.version })}</p>
        )}
        {newerNativeVersion(
          published?.publishedVersion,
          availableVersion ?? t("versionUnknown"),
        ) && <p className="pt-2 text-amber-400">{t("nativeBuildRequired")}</p>}
        <a
          href="https://github.com/Tyravex/tyravex-plugins/tree/main/integrations/support-center"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block pt-2 text-primary"
        >
          {t("sourceRepository")}
        </a>
      </div>
      {query.isError && (
        <p role="alert" className="text-sm text-amber-300">
          {t("error")}
        </p>
      )}
      {query.isLoading && <p role="status">{t("loading")}</p>}
      <div className="flex flex-wrap gap-2">
        {installed &&
          newerNativeVersion(
            availableVersion ?? t("versionUnknown"),
            installed.version,
          ) &&
          manage && (
            <button
              disabled={busy}
              onClick={() => {
                setAction("upgrade");
                setConfirmation("");
                setError("");
              }}
              className="rounded-xl bg-primary px-4 py-2 text-white"
            >
              {t("upgradePlugin")}
            </button>
          )}
        {!installed && plugin && manage && (
          <button
            disabled={busy}
            onClick={() => {
              setAction("install");
              setConfirmation("");
              setError("");
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-white"
          >
            <Download size={16} />
            {t("install")}
          </button>
        )}
        {installed?.status === "INSTALLED" &&
          actor?.permissions.includes("support:read") && (
            <Link
              to="/admin/support"
              className="rounded-xl bg-primary px-4 py-2 text-white"
            >
              {t("open")}
            </Link>
          )}
        {installed && manage && (
          <button
            disabled={busy}
            onClick={() =>
              void run(() =>
                api.post(
                  `/admin/plugins/${SUPPORT_PLUGIN_ID}/${installed.status === "INSTALLED" ? "disable" : "enable"}`,
                ),
              )
            }
            className="rounded-xl border border-border-subtle px-4 py-2"
          >
            {t(installed.status === "INSTALLED" ? "disable" : "enable")}
          </button>
        )}
        {installed?.status === "DISABLED" &&
          actor?.permissions.includes("plugin:delete") && (
            <button
              onClick={() => {
                setAction("uninstall");
                setConfirmation("");
                setError("");
              }}
              className="rounded-xl border border-rose-400/30 px-4 py-2 text-rose-300"
            >
              {t("uninstall")}
            </button>
          )}
      </div>
      {installed && compact && (
        <Link
          className="inline-block text-sm text-primary"
          to="/admin/plugins/tyravex.support-center"
        >
          {t("manageNative")}
        </Link>
      )}
      {installed && !compact && <PluginRoleBindingPanel />}
      {error && !action && (
        <p role="alert" className="text-rose-300">
          {t(error, { defaultValue: t("error") })}
        </p>
      )}
      <Modal
        open={!!action}
        busy={busy}
        onClose={() => setAction(null)}
        title={t(
          action === "upgrade"
            ? "upgradePlugin"
            : action === "install"
              ? "installTitle"
              : "uninstall",
        )}
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-text-secondary">
            {t(
              action === "upgrade"
                ? "upgradeHelp"
                : action === "install"
                  ? "installHelp"
                  : "uninstallHelp",
            )}
          </p>
          <code className="block break-all rounded-xl bg-background p-3 text-sm">
            {SUPPORT_PLUGIN_ID}
          </code>
          <label className="block space-y-2">
            <span>{t("confirmation")}</span>
            <input
              className="w-full rounded-xl border border-border-subtle bg-background p-3"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={busy}
            />
          </label>
          {action === "uninstall" && (
            <label className="flex items-center gap-2 text-rose-300">
              <input
                type="checkbox"
                checked={deleteData}
                onChange={(event) => setDeleteData(event.target.checked)}
                disabled={busy}
              />
              {t("deleteData")}
            </label>
          )}
          {error && (
            <p role="alert" className="text-rose-300">
              {t(error, { defaultValue: t("error") })}
            </p>
          )}
          <button
            disabled={busy || confirmation !== SUPPORT_PLUGIN_ID}
            onClick={() =>
              void run(() =>
                action === "upgrade"
                  ? supportCenterApi.upgrade(SUPPORT_PLUGIN_ID, confirmation)
                  : action === "install"
                    ? supportCenterApi.install(SUPPORT_PLUGIN_ID, confirmation)
                    : supportCenterApi.uninstall(
                        SUPPORT_PLUGIN_ID,
                        confirmation,
                        deleteData,
                      ),
              )
            }
            className="rounded-xl bg-primary px-5 py-3 text-white disabled:opacity-40"
          >
            {t(busy ? "loading" : "confirm")}
          </button>
        </div>
      </Modal>
    </section>
  );
}
