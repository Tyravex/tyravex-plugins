import { useState } from "react";
import { Modal } from "@/shared/ui/Modal";
import { useSupportTranslation } from "../lib/useSupportTranslation";

export function SupportTicketForm({
  open,
  busy,
  services,
  onClose,
  create,
  serviceLocked = false,
  help,
  error,
}: {
  open: boolean;
  busy: boolean;
  serviceLocked?: boolean;
  help?: string;
  error?: string;
  services: Array<{ id: string; name: string }>;
  onClose: () => void;
  create: (body: {
    serviceId: string;
    subject: string;
    body: string;
  }) => Promise<void>;
}) {
  const { t } = useSupportTranslation();
  const [serviceId, setServiceId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const selected =
    services.find((service) => service.id === serviceId)?.id ??
    services[0]?.id ??
    "";
  return (
    <Modal open={open} title={t("newTicket")} busy={busy} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void create({ serviceId: selected, subject, body });
        }}
      >
        {help && (
          <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm leading-6 text-text-secondary">
            {help}
          </p>
        )}
        <label className="block space-y-2">
          <span>{t("service")}</span>
          <select
            className="w-full rounded-xl border border-border-subtle bg-background p-3"
            value={selected}
            onChange={(event) => setServiceId(event.target.value)}
            required
            disabled={serviceLocked || busy}
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} — {service.id}
              </option>
            ))}
          </select>
        </label>
        {!services.length && (
          <p className="text-sm text-amber-300">{t("noServices")}</p>
        )}
        <label className="block space-y-2">
          <span>{t("subject")}</span>
          <input
            required
            minLength={3}
            maxLength={160}
            className="w-full rounded-xl border border-border-subtle bg-background p-3"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>
        <label className="block space-y-2">
          <span>{t("message")}</span>
          <textarea
            required
            minLength={3}
            maxLength={8000}
            className="min-h-36 w-full rounded-xl border border-border-subtle bg-background p-3"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        <p className="text-xs leading-5 text-amber-300">{t("secretWarning")}</p>
        <button
          disabled={
            busy ||
            !selected ||
            subject.trim().length < 3 ||
            body.trim().length < 3
          }
          className="rounded-xl bg-primary px-5 py-3 text-white disabled:opacity-40"
        >
          {t("create")}
        </button>
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
