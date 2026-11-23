import { useState } from "react";
import { Headset } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/app/store/auth.store";
import { supportCenterApi } from "../api/supportCenterApi";
import { useSupportAvailability } from "../hooks/useSupportAvailability";
import { useSupportTranslation } from "../lib/useSupportTranslation";
import { supportError } from "../lib/supportError";
import { SupportTicketForm } from "./SupportTicketForm";
import { supportTicketPath } from "@/shared/lib/routes/support";

export function ServiceSupportAction({
  service,
}: {
  service: { id: string; name: string; userId: number | null };
}) {
  const { t } = useSupportTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const actorId = useAuthStore((state) => state.user?.id);
  const owner = !!actorId && actorId === service.userId;
  const availability = useSupportAvailability(owner);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (
    !owner ||
    !availability.data?.enabled ||
    availability.data.ready === false ||
    availability.isError
  )
    return null;
  const create = async (body: {
    serviceId: string;
    subject: string;
    body: string;
  }) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // Bind to the displayed service rather than trusting a selectable form value.
      const ticket = await supportCenterApi.create({
        ...body,
        serviceId: service.id,
      });
      void client.invalidateQueries({ queryKey: ["support-tickets"] });
      setOpen(false);
      navigate(supportTicketPath(ticket.id));
    } catch (reason) {
      setError(t(supportError(reason), { defaultValue: t("error") }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/15"
      >
        <Headset size={17} aria-hidden="true" />
        {t("callSupport")}
      </button>
      <SupportTicketForm
        open={open}
        busy={busy}
        services={[{ id: service.id, name: service.name }]}
        serviceLocked
        help={t("callSupportHelp")}
        error={error}
        onClose={() => setOpen(false)}
        create={create}
      />
    </>
  );
}
