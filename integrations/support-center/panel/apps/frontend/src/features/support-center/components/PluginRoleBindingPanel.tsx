import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/app/store/auth.store";
import { Modal } from "@/shared/ui/Modal";
import { supportCenterApi } from "../api/supportCenterApi";
import { useSupportTranslation } from "../lib/useSupportTranslation";
import { supportError } from "../lib/supportError";

export function PluginRoleBindingPanel() {
  const { t } = useSupportTranslation();
  const client = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canRead =
    !!user?.permissions.includes("role:read") &&
    !!user?.permissions.includes("plugin:read");
  const canBind =
    canRead &&
    !!user?.permissions.includes("role:manage") &&
    !!user?.permissions.includes("plugin:manage");
  const query = useQuery({
    queryKey: ["plugin-role-candidates", user?.id],
    queryFn: supportCenterApi.roleCandidates,
    enabled: canRead,
    retry: false,
  });
  const [roleId, setRoleId] = useState("");
  const [enableTickets, setEnableTickets] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bind = async () => {
    setBusy(true);
    setError("");
    try {
      if (enableTickets)
        await supportCenterApi.enableTicketRole(roleId, confirmation);
      else await supportCenterApi.bindRole(roleId, confirmation);
      await client.invalidateQueries({ queryKey: ["plugin-role-candidates"] });
      await client.invalidateQueries({ queryKey: ["support-staff"] });
      setRoleId("");
      setConfirmation("");
    } catch (reason) {
      setError(supportError(reason));
    } finally {
      setBusy(false);
    }
  };
  if (!canRead) return null;
  return (
    <div className="space-y-3 border-t border-border-subtle pt-4">
      {query.isError && (
        <p role="alert" className="text-sm text-amber-300">
          {t("stateUnknown")}
        </p>
      )}
      {query.data?.map((role) => (
        <div
          key={role.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle p-3"
        >
          <div>
            <p className="text-sm font-semibold">{role.name}</p>
            <p className="mt-1 text-xs text-text-secondary">
              {t(role.managed ? "roleProtectionHelp" : "roleBindingNeeded")}
            </p>
            {role.permissions && (
              <p
                className={`mt-2 text-xs ${["support:read", "support:manage"].every((name) => role.permissions!.includes(name)) ? "text-emerald-300" : "text-amber-300"}`}
              >
                {t(
                  ["support:read", "support:manage"].every((name) =>
                    role.permissions!.includes(name),
                  )
                    ? "ticketRoleReady"
                    : "ticketRoleMissing",
                )}
              </p>
            )}
          </div>
          {canBind &&
            role.permissions &&
            !["support:read", "support:manage"].every((name) =>
              role.permissions!.includes(name),
            ) && (
              <button
                onClick={() => {
                  setEnableTickets(true);
                  setRoleId(role.id);
                  setConfirmation("");
                  setError("");
                }}
                className="rounded-xl bg-primary px-3 py-2 text-sm text-white"
              >
                {t("enableTicketRole")}
              </button>
            )}
          {role.managed ? (
            <span className="inline-flex items-center gap-1 text-xs text-primary">
              <ShieldCheck size={14} />
              {t("roleProtected")}
            </span>
          ) : (
            canBind && (
              <button
                onClick={() => {
                  setEnableTickets(false);
                  setRoleId(role.id);
                  setConfirmation("");
                  setError("");
                }}
                className="rounded-xl border border-primary/30 px-3 py-2 text-sm text-primary"
              >
                {t("bindRole")}
              </button>
            )
          )}
        </div>
      ))}
      {user?.permissions.includes("user:read") &&
        user.permissions.includes("role:assign") && (
          <p className="text-sm text-text-secondary">
            {t("assignStaffHelp")}{" "}
            <Link className="text-primary underline" to="/admin/users">
              {t("manageStaff")}
            </Link>
          </p>
        )}
      <Modal
        open={!!roleId}
        busy={busy}
        title={t(enableTickets ? "enableTicketRole" : "bindRole")}
        onClose={() => setRoleId("")}
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-text-secondary">
            {t(enableTickets ? "enableTicketRoleHelp" : "bindRoleHelp")}
          </p>
          <code className="block break-all rounded-xl bg-background p-3">
            {roleId}
          </code>
          <label className="block space-y-2">
            <span>{t("roleIdConfirmation")}</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={busy}
              className="w-full rounded-xl border border-border-subtle bg-background p-3"
            />
          </label>
          {error && (
            <p role="alert" className="text-rose-300">
              {t(error, { defaultValue: t("error") })}
            </p>
          )}
          <button
            disabled={busy || confirmation !== roleId}
            onClick={() => void bind()}
            className="rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-40"
          >
            {t(busy ? "loading" : "confirm")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
