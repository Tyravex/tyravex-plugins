import { useState } from "react";
import type { SupportEvent, SupportTicket } from "@shared/types";
import { supportCenterApi } from "../api/supportCenterApi";
import { useSupportTranslation } from "../lib/useSupportTranslation";

export function SupportHistory({
  ticket,
  staff,
  preview,
}: {
  ticket: SupportTicket;
  staff: boolean;
  preview: boolean;
}) {
  const { t, i18n } = useSupportTranslation();
  const [older, setOlder] = useState<SupportEvent[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const events = [
    ...new Map(
      [...older, ...ticket.events].map((event) => [event.id, event]),
    ).values(),
  ].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
  const more = cursor === undefined ? ticket.eventsNextCursor : cursor;
  const load = async () => {
    if (!more || preview) return;
    setBusy(true);
    setError(false);
    try {
      const page = await supportCenterApi.events(ticket.id, staff, more);
      setOlder((current) => [...current, ...ticket.events, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <p className="break-all text-xs text-text-secondary">
        {ticket.serviceName} — {ticket.serviceId}
      </p>
      <ol className="space-y-3">
        {events.map((event) => (
          <li
            key={event.id}
            className="space-y-1 border-l-2 border-primary/25 py-1 pl-4"
          >
            <p className="text-sm font-medium">
              {t(`event_${event.action}`, { defaultValue: event.action })}
              {event.targetName && ` → ${event.targetName}`}
            </p>
            <p className="text-xs text-text-secondary">
              {event.actorName} ·{" "}
              {new Date(event.createdAt).toLocaleString(i18n.language)}
            </p>
            {event.outcome && (
              <p
                className={`text-xs ${event.outcome === "SUCCEEDED" ? "text-emerald-300" : event.outcome === "FAILED" ? "text-rose-300" : "text-amber-300"}`}
              >
                {t(`outcome_${event.outcome}`)}
                {event.finishedAt &&
                  ` · ${new Date(event.finishedAt).toLocaleString(i18n.language)}`}
              </p>
            )}
            {event.requestId && (
              <p className="break-all font-mono text-[11px] text-text-secondary">
                {t("operationId")}: {event.requestId}
              </p>
            )}
            {event.errorCode && (
              <p className="break-all text-xs text-text-secondary">
                {event.errorCode}
              </p>
            )}
          </li>
        ))}
      </ol>
      {more && (
        <button
          disabled={busy}
          onClick={() => void load()}
          className="rounded-lg border border-border-subtle px-3 py-2 text-sm"
        >
          {t(busy ? "loading" : "olderEvents")}
        </button>
      )}
      {error && (
        <p role="alert" className="text-rose-300">
          {t("error")}
        </p>
      )}
    </div>
  );
}
