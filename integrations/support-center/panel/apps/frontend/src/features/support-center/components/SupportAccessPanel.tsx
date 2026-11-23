import { ShieldCheck, Clock3 } from "lucide-react";
import { type SupportScope, type SupportTicket } from "@shared/types";
import { useSupportTranslation } from "../lib/useSupportTranslation";
import {
  SupportConsentForm,
  type SupportConsentFields,
} from "./SupportConsentForm";
import { SupportOwnerAccess } from "./SupportOwnerAccess";

export function SupportAccessPanel({
  ticket,
  actorId,
  staff,
  canRequest,
  busy,
  now,
  request,
  grant,
  decide,
}: {
  ticket: SupportTicket;
  actorId: number;
  staff: boolean;
  canRequest: boolean;
  busy: boolean;
  now: number;
  grant?: (
    body: SupportConsentFields & { staffId: number },
    onSuccess: () => void,
  ) => Promise<void>;
  request: (
    body: { reason: string; scopes: SupportScope[]; durationMinutes: number },
    onSuccess: () => void,
  ) => Promise<void>;
  decide: (
    id: string,
    decision: "APPROVE" | "REJECT" | "REVOKE",
  ) => Promise<void>;
}) {
  const { t, i18n } = useSupportTranslation();
  const open = ["OPEN", "IN_PROGRESS"].includes(ticket.status);
  const current = ticket.grants.some(
    (grant) =>
      grant.staffId === actorId &&
      (grant.status === "PENDING" ||
        (grant.status === "ACTIVE" &&
          !!grant.expiresAt &&
          Date.parse(grant.expiresAt) > now)),
  );
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-text-secondary">
        {t("consentNote")}
      </p>
      {grant && (
        <SupportOwnerAccess
          ticket={ticket}
          actorId={actorId}
          busy={busy}
          now={now}
          grant={grant}
        />
      )}
      {staff && !canRequest && ticket.ownerId !== actorId && open && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm leading-6 text-amber-300">
          {t("staffAccessPermissionMissing")}
        </p>
      )}
      {ticket.grants.length === 0 && (
        <p className="text-sm text-text-secondary">{t("noAccess")}</p>
      )}
      {ticket.grants.map((grant) => {
        const status =
          grant.status === "ACTIVE" &&
          (!grant.expiresAt || Date.parse(grant.expiresAt) <= now)
            ? "EXPIRED"
            : grant.status;
        return (
          <article
            key={grant.id}
            className="space-y-3 rounded-xl border border-border-subtle p-4"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <span className="flex items-center gap-2 font-semibold">
                <ShieldCheck size={18} className="text-primary" />
                {grant.staffName}
              </span>
              <span
                className={`rounded-lg px-2 py-1 text-xs ${status === "ACTIVE" ? "bg-emerald-400/10 text-emerald-300" : status === "PENDING" ? "bg-amber-400/10 text-amber-300" : "bg-white/5 text-text-secondary"}`}
              >
                {t(`grant_${status}`)}
              </span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-text-secondary">
              {grant.reason}
            </p>
            <div className="flex flex-wrap gap-2">
              {grant.scopes.map((scope) => (
                <span
                  key={scope}
                  className="rounded-lg border border-border-subtle px-2 py-1 text-xs"
                >
                  {t(`scope_${scope.replace(":", "_")}`)}
                </span>
              ))}
            </div>
            <p className="flex items-center gap-2 text-xs text-text-secondary">
              <Clock3 size={14} />
              {t("minutes", { count: grant.durationMinutes })}
              {grant.expiresAt &&
                ` · ${t("expires")}: ${new Date(grant.expiresAt).toLocaleString(i18n.language)}`}
            </p>
            {grant.scopes.includes("secrets") && (
              <p className="text-sm text-amber-300">{t("secretWarning")}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {ticket.ownerId === actorId && open && status === "PENDING" && (
                <>
                  <button
                    disabled={busy}
                    onClick={() => void decide(grant.id, "APPROVE")}
                    className="rounded-lg bg-primary px-3 py-2 text-sm text-white"
                  >
                    {t("approve")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void decide(grant.id, "REJECT")}
                    className="rounded-lg border border-border-subtle px-3 py-2 text-sm"
                  >
                    {t("reject")}
                  </button>
                </>
              )}
              {["PENDING", "ACTIVE"].includes(status) &&
                (ticket.ownerId === actorId || grant.staffId === actorId) && (
                  <button
                    disabled={busy}
                    onClick={() => void decide(grant.id, "REVOKE")}
                    className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-300"
                  >
                    {t("revoke")}
                  </button>
                )}
            </div>
          </article>
        );
      })}
      {staff &&
        canRequest &&
        ticket.ownerId !== actorId &&
        open &&
        !current && (
          <SupportConsentForm
            busy={busy}
            action="requestAccess"
            submit={request}
          />
        )}
    </div>
  );
}
