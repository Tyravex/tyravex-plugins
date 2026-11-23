import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SupportMessage, SupportTicket } from "@shared/types";
import type { useSupportCenter } from "../hooks/useSupportCenter";
import { supportCenterApi } from "../api/supportCenterApi";
import { useSupportTranslation } from "../lib/useSupportTranslation";

export function SupportConversation({
  ticket,
  model,
  staff,
  preview,
  active = true,
}: {
  ticket: SupportTicket;
  model: ReturnType<typeof useSupportCenter>;
  staff: boolean;
  preview: boolean;
  active?: boolean;
}) {
  const { t, i18n } = useSupportTranslation();
  const client = useQueryClient();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [older, setOlder] = useState<SupportMessage[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const read = useRef("");
  const messages = [
    ...new Map(
      [...older, ...ticket.messages].map((message) => [message.id, message]),
    ).values(),
  ].sort((a, b) =>
    a.sequence && b.sequence
      ? BigInt(a.sequence) < BigInt(b.sequence)
        ? -1
        : 1
      : Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const latestPublic = messages
    .filter((message) => !message.internal)
    .slice(-1)[0]?.id;
  useEffect(() => {
    if (!active || !latestPublic || read.current === latestPublic) return;
    read.current = latestPublic;
    void model.operations
      .markRead(ticket.id, latestPublic)
      .then(() => {
        if (!preview) {
          void client.invalidateQueries({ queryKey: ["support-unread"] });
          void client.invalidateQueries({ queryKey: ["support-tickets"] });
        }
      })
      .catch(() => {});
  }, [active, latestPublic, ticket.id, model.operations, client, preview]);
  const more = cursor === undefined ? ticket.messagesNextCursor : cursor;
  const load = async () => {
    if (!more || preview) return;
    setLoading(true);
    setError(false);
    try {
      const page = await supportCenterApi.messages(ticket.id, staff, more);
      setOlder((current) => [...current, ...ticket.messages, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  const writable = !staff || model.canManage;
  const mayNote = staff && model.canManage && ticket.ownerId !== model.actorId;
  return (
    <div className="space-y-4">
      {more && (
        <button
          disabled={loading}
          onClick={() => void load()}
          className="rounded-lg border border-border-subtle px-3 py-2 text-sm"
        >
          {t(loading ? "loading" : "olderMessages")}
        </button>
      )}
      {error && (
        <p role="alert" className="text-rose-300">
          {t("error")}
        </p>
      )}
      <div className="max-h-[60vh] min-h-40 space-y-4 overflow-y-auto">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`rounded-xl border p-4 ${message.internal ? "border-amber-400/30 bg-amber-400/5" : message.authorId === ticket.ownerId ? "border-border-subtle bg-background/50" : "border-primary/25 bg-primary/5"}`}
          >
            {message.internal && (
              <p className="mb-2 text-xs font-semibold text-amber-300">
                {t("internalNote")}
              </p>
            )}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold">{message.authorName}</span>
              <time
                className="text-text-secondary"
                dateTime={message.createdAt}
              >
                {new Date(message.createdAt).toLocaleString(i18n.language)}
              </time>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {message.body}
            </p>
          </article>
        ))}
      </div>
      {["OPEN", "IN_PROGRESS"].includes(ticket.status) && writable && (
        <form
          className="space-y-3 border-t border-border-subtle pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void model.run(
              () =>
                internal && mayNote
                  ? model.operations.note(ticket.id, body)
                  : model.operations.message(ticket.id, body),
              () => setBody(""),
            );
          }}
        >
          {mayNote && (
            <label className="flex items-center gap-2 text-sm text-amber-300">
              <input
                type="checkbox"
                checked={internal}
                onChange={(event) => setInternal(event.target.checked)}
              />
              {t("internalNote")}
            </label>
          )}
          {internal && mayNote && (
            <p className="text-xs text-amber-300">{t("internalNoteHelp")}</p>
          )}
          <label className="block space-y-2 text-sm">
            <span>{t("message")}</span>
            <textarea
              required
              maxLength={8000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-28 w-full rounded-xl border border-border-subtle bg-background p-3"
            />
          </label>
          <button
            disabled={model.busy || !body.trim()}
            className="rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-40"
          >
            {t(internal && mayNote ? "addNote" : "send")}
          </button>
        </form>
      )}
    </div>
  );
}
