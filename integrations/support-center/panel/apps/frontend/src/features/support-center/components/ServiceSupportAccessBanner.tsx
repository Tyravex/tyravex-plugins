import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/app/store/auth.store";
import { supportCenterApi } from "../api/supportCenterApi";
import { useSupportAvailability } from "../hooks/useSupportAvailability";
import { useSupportTranslation } from "../lib/useSupportTranslation";
import { supportTicketPath } from "@/shared/lib/routes/support";

export function ServiceSupportAccessBanner({
  service,
}: {
  service: { id: string; userId: number | null };
}) {
  const { t } = useSupportTranslation();
  const client = useQueryClient();
  const actorId = useAuthStore((state) => state.user?.id);
  const owner = !!actorId && actorId === service.userId;
  const availability = useSupportAvailability(owner);
  const enabled =
    owner && !!availability.data?.enabled && availability.data.ready !== false;
  const query = useQuery({
    queryKey: ["support-active-access", actorId, service.id],
    queryFn: () => supportCenterApi.activeAccess(service.id),
    enabled,
    retry: false,
    refetchInterval: (query) => (query.state.error ? false : 10000),
  });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!query.data?.length) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [query.data?.length]);
  const grants =
    query.data?.filter(
      (grant) => grant.expiresAt && Date.parse(grant.expiresAt) > now,
    ) ?? [];
  const revoke = async (ticketId: string, grantId: string) => {
    setBusy(grantId);
    setError(false);
    try {
      await supportCenterApi.decide(ticketId, grantId, "REVOKE");
      await client.invalidateQueries({ queryKey: ["support-active-access"] });
      void client.invalidateQueries({ queryKey: ["support-ticket"] });
    } catch {
      setError(true);
    } finally {
      setBusy("");
    }
  };
  if (!enabled || (!grants.length && !query.isError)) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
        <ShieldCheck size={18} />
        {t("activeSupportAccess")}
      </h2>
      {(query.isError || error) && (
        <p role="alert" className="text-xs text-amber-300">
          {t("stateUnknown")}
        </p>
      )}
      {grants.map((grant) => {
        const seconds = Math.max(
          0,
          Math.ceil((Date.parse(grant.expiresAt!) - now) / 1000),
        );
        const clock = [
          Math.floor(seconds / 3600),
          Math.floor(seconds / 60) % 60,
          seconds % 60,
        ]
          .map((value) => String(value).padStart(2, "0"))
          .join(":");
        return (
          <div
            key={grant.id}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-400/10 pt-3"
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                {grant.staffName} · {t("accessRemaining", { time: clock })}
              </p>
              <p className="text-xs text-text-secondary">
                {grant.scopes
                  .map((scope) => t(`scope_${scope.replace(":", "_")}`))
                  .join(" · ")}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to={supportTicketPath(grant.ticketId)}
                className="rounded-lg border border-border-subtle px-3 py-2 text-xs"
              >
                {t("open")}
              </Link>
              <button
                disabled={!!busy}
                onClick={() => void revoke(grant.ticketId, grant.id)}
                className="rounded-lg border border-rose-400/30 px-3 py-2 text-xs text-rose-300 disabled:opacity-40"
              >
                {t("revoke")}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
