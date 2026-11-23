import { useEffect, useId, useState } from "react";
import { History, MessageSquare, ShieldCheck } from "lucide-react";
import type { SupportTicket } from "@shared/types";
import type { SupportCenterModel } from "../../model/support-center.model";
import { useSupportTranslation } from "../../lib/useSupportTranslation";
import { SupportConversation } from "../SupportConversation";
import { SupportHistory } from "../SupportHistory";
import { SupportWorkspacePanel } from "../SupportWorkspacePanel";
import { SupportTicketHeader } from "./SupportTicketHeader";
import { SupportTicketContext } from "./SupportTicketContext";

export function SupportTicketDetail({
  ticket,
  model,
  staff,
  preview,
}: {
  ticket: SupportTicket;
  model: SupportCenterModel;
  staff: boolean;
  preview: boolean;
}) {
  const { t } = useSupportTranslation();
  const [tab, setTab] = useState("messages");
  const [now, setNow] = useState(Date.now);
  const id = useId();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const grant = ticket.grants.find(
    (value) =>
      value.staffId === model.actorId &&
      value.status === "ACTIVE" &&
      value.expiresAt &&
      Date.parse(value.expiresAt) > now,
  );
  const workspaceAvailable =
    grant &&
    !ticket.archivedAt &&
    ["OPEN", "IN_PROGRESS"].includes(ticket.status);
  const tabs = [
    { key: "messages", label: "messages", Icon: MessageSquare },
    { key: "history", label: "history", Icon: History },
    ...(staff
      ? [{ key: "workspace", label: "workspaceTab", Icon: ShieldCheck }]
      : []),
  ];
  return (
    <section aria-label={t("ticketView")} className="min-w-0 space-y-4">
      <SupportTicketHeader ticket={ticket} model={model} staff={staff} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <SupportTicketContext
          ticket={ticket}
          model={model}
          staff={staff}
          now={now}
        />
        <div className="min-w-0 overflow-hidden rounded-2xl border border-border-subtle bg-surface xl:col-start-1 xl:row-start-1">
          <nav
            aria-label={t("ticketContent")}
            className="flex flex-wrap gap-1 border-b border-border-subtle p-2"
          >
            {tabs.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                aria-controls={`${id}-${key}`}
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${tab === key ? "bg-primary/15 text-primary" : "text-text-secondary"}`}
              >
                <Icon size={16} aria-hidden="true" />
                {t(label)}
              </button>
            ))}
          </nav>
          <div
            id={`${id}-messages`}
            hidden={tab !== "messages"}
            className="p-4 sm:p-5"
          >
            <SupportConversation
              ticket={ticket}
              model={model}
              staff={staff}
              preview={preview}
              active={tab === "messages"}
            />
          </div>
          <div
            id={`${id}-history`}
            hidden={tab !== "history"}
            className="p-4 sm:p-5"
          >
            <SupportHistory ticket={ticket} staff={staff} preview={preview} />
          </div>
          {staff && tab === "workspace" && (
            <div id={`${id}-workspace`} className="p-4 sm:p-5">
              {workspaceAvailable ? (
                <SupportWorkspacePanel
                  key={grant.id}
                  ticketId={ticket.id}
                  grant={grant}
                  preview={preview}
                />
              ) : (
                <p className="rounded-xl border border-dashed border-border-subtle p-5 text-sm leading-6 text-text-secondary">
                  {t("workspaceLockedHelp")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
