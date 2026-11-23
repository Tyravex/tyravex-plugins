import { Boxes, ChevronDown, ShieldCheck } from "lucide-react";
import type { SupportTicket } from "@shared/types";
import type { SupportCenterModel } from "../../model/support-center.model";
import { useSupportTranslation } from "../../lib/useSupportTranslation";
import { useSupportDetailsDisclosure } from "../../hooks/useSupportDetailsDisclosure";
import { SupportAssignmentPanel } from "../SupportAssignmentPanel";
import { SupportAccessPanel } from "../SupportAccessPanel";

export function SupportTicketContext({
  ticket,
  model,
  staff,
  now,
}: {
  ticket: SupportTicket;
  model: SupportCenterModel;
  staff: boolean;
  now: number;
}) {
  const { t, i18n } = useSupportTranslation();
  const disclosure = useSupportDetailsDisclosure();
  const pending = ticket.grants.filter(
    (grant) => grant.status === "PENDING",
  ).length;
  return (
    <aside
      className="min-w-0 xl:col-start-2 xl:row-start-1"
      aria-label={t("detailsAndAccess")}
    >
      <details
        open={disclosure.open}
        onToggle={(event) => {
          disclosure.setExpanded(event.currentTarget.open);
        }}
        className="group overflow-hidden rounded-2xl border border-border-subtle bg-surface"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium">
          <span className="flex items-center gap-2">
            <ShieldCheck
              size={17}
              className="text-primary"
              aria-hidden="true"
            />
            {t("detailsAndAccess")}
            {pending > 0 && (
              <span className="rounded-md bg-amber-400/10 px-1.5 py-0.5 text-xs text-amber-400">
                {pending}
              </span>
            )}
          </span>
          <ChevronDown
            size={16}
            className="shrink-0 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="divide-y divide-border-subtle border-t border-border-subtle">
          <section className="space-y-4 p-4" aria-label={t("ticketDetails")}>
            <h3 className="text-sm font-semibold">{t("ticketDetails")}</h3>
            <SupportAssignmentPanel
              ticket={ticket}
              model={model}
              staff={staff}
              embedded
            />
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-text-secondary">{t("owner")}</dt>
                <dd className="mt-1 break-words">{ticket.ownerName}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-secondary">
                  {t("createdAt")}
                </dt>
                <dd className="mt-1">
                  <time dateTime={ticket.createdAt}>
                    {new Date(ticket.createdAt).toLocaleString(i18n.language)}
                  </time>
                </dd>
              </div>
              {["OPEN", "IN_PROGRESS"].includes(ticket.status) && (
                <div>
                  <dt className="text-xs text-text-secondary">
                    {t("waitingFor")}
                  </dt>
                  <dd className="mt-1 text-text-secondary">
                    {t(
                      ticket.waitingFor === "CLIENT"
                        ? staff
                          ? "waitingClient"
                          : "waitingYou"
                        : "waitingStaff",
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <section className="space-y-2 p-4" aria-label={t("service")}>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Boxes size={16} className="text-primary" aria-hidden="true" />
              {t("service")}
            </h3>
            <p className="break-words text-sm">{ticket.serviceName}</p>
            <p className="break-all font-mono text-xs text-text-secondary">
              {ticket.serviceId}
            </p>
          </section>
          <section className="space-y-3 p-4" aria-label={t("access")}>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck
                size={16}
                className="text-primary"
                aria-hidden="true"
              />
              {t("access")}
            </h3>
            <SupportAccessPanel
              ticket={ticket}
              actorId={model.actorId}
              staff={staff}
              canRequest={model.canRequest}
              busy={model.busy}
              now={now}
              grant={(body, onSuccess) =>
                model.run(
                  () => model.operations.grantAccess(ticket.id, body),
                  onSuccess,
                )
              }
              request={(body, onSuccess) =>
                model.run(
                  () => model.operations.requestAccess(ticket.id, body),
                  onSuccess,
                )
              }
              decide={(id, decision) =>
                model.run(() =>
                  model.operations.decide(ticket.id, id, decision),
                )
              }
            />
          </section>
        </div>
      </details>
    </aside>
  );
}
