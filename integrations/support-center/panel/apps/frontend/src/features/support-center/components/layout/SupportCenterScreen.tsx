import { useState } from "react";
import { ArrowLeft, Inbox } from "lucide-react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type { SupportTicketFilters } from "@shared/types";
import {
  supportBackPath,
  supportListPath,
  supportTicketPath,
} from "@/shared/lib/routes/support";
import { useSupportTranslation } from "../../lib/useSupportTranslation";
import {
  readSupportQueueParams,
  writeSupportQueueParams,
} from "../../lib/supportQueueParams";
import { useSupportCenter } from "../../hooks/useSupportCenter";
import type { SupportLayout } from "../../model/support-center.model";
import { SupportTicketDetail } from "../SupportTicketDetail";
import { SupportTicketForm } from "../SupportTicketForm";
import { SupportQueue } from "../queue/SupportQueue";
import { SupportPageHeader } from "./SupportPageHeader";
import { SupportPreviewToolbar } from "./SupportPreviewToolbar";

export function SupportCenterScreen({
  preview = false,
  staff = false,
  detail = false,
}: {
  preview?: boolean;
  staff?: boolean;
  detail?: boolean;
}) {
  const { t } = useSupportTranslation();
  const [perspective, setPerspective] = useState(false);
  const isStaff = preview ? perspective : staff;
  const [params, setParams] = useSearchParams();
  const { ticketId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const filters = readSupportQueueParams(params);
  const layout: SupportLayout =
    isStaff && params.get("view") === "inbox" ? "inbox" : "list";
  const selected = detail ? (ticketId ?? "") : (params.get("ticket") ?? "");
  const model = useSupportCenter(preview, isStaff, selected, filters, {
    listEnabled: !detail,
  });
  const [creating, setCreating] = useState(false);
  const queueParams = new URLSearchParams(params);
  queueParams.delete("ticket");
  const queuePath = `${location.pathname}${queueParams.size ? `?${queueParams}` : ""}`;
  const backTo = detail
    ? supportBackPath(location.state?.supportBackTo, isStaff)
    : queuePath;
  const onFilters = (value: SupportTicketFilters) =>
    setParams(writeSupportQueueParams(params, value), { replace: true });
  const previewPath = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("ticket", id);
    return `${location.pathname}?${next}`;
  };
  const choose = (id: string) => {
    if (preview || layout === "inbox") {
      const next = new URLSearchParams(params);
      next.set("ticket", id);
      setParams(next);
    } else
      navigate(supportTicketPath(id, isStaff), {
        state: { supportBackTo: queuePath },
      });
  };
  const onLayout = (value: SupportLayout) => {
    const next = new URLSearchParams(params);
    if (value === "inbox") next.set("view", value);
    else next.delete("view");
    if (!preview && selected && value === "list") {
      next.delete("ticket");
      navigate(supportTicketPath(selected, isStaff), {
        state: { supportBackTo: `${supportListPath(isStaff)}?${next}` },
      });
    } else setParams(next, { replace: true });
  };
  // Preserve existing links from emails and older notifications.
  if (!preview && !detail && selected && layout !== "inbox")
    return (
      <Navigate
        replace
        to={supportTicketPath(selected, isStaff)}
        state={{ supportBackTo: queuePath }}
      />
    );
  const showQueue = !detail && (layout === "inbox" || !selected);
  const showTicket = detail || !!selected;
  const ticketContent = model.ticket ? (
    <SupportTicketDetail
      key={`${model.ticket.id}:${isStaff}`}
      ticket={model.ticket}
      model={model}
      staff={isStaff}
      preview={preview}
    />
  ) : (
    <div
      role={model.detailLoading ? "status" : undefined}
      className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-text-secondary"
    >
      <Inbox size={28} aria-hidden="true" />
      <p>
        {t(
          model.detailLoading
            ? "loading"
            : selected
              ? "ticketUnavailable"
              : "choose",
        )}
      </p>
    </div>
  );
  return (
    <div className="min-w-0 space-y-5">
      <SupportPageHeader
        staff={isStaff}
        preview={preview}
        layout={layout}
        onLayout={detail ? undefined : onLayout}
        onCreate={
          !detail && !isStaff && model.available
            ? () => setCreating(true)
            : undefined
        }
        busy={model.busy}
        refreshPermissions={() => void model.refreshPermissions()}
        canAssignStaff={model.canAssignStaff}
      />
      {preview && (
        <SupportPreviewToolbar
          staff={isStaff}
          onPerspective={setPerspective}
          reset={() => {
            model.reset();
            setParams({}, { replace: true });
          }}
        />
      )}
      {showTicket && (detail || layout !== "inbox") && (
        <Link
          to={backTo}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-primary"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {t("backToTickets")}
        </Link>
      )}
      {model.error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-400/30 p-4 text-sm text-rose-400"
        >
          {t(model.error, { defaultValue: t("error") })}
        </p>
      )}
      {model.loading && (
        <p role="status" className="text-sm text-text-secondary">
          {t("loading")}
        </p>
      )}
      {!model.loading && !model.available && (
        <p className="rounded-2xl border border-border-subtle bg-surface p-6 text-text-secondary">
          {t(
            model.upgradeRequired ? "SUPPORT_UPGRADE_REQUIRED" : "notInstalled",
          )}
        </p>
      )}
      {model.available && (
        <div
          className={
            layout === "inbox" && !detail
              ? "grid items-start gap-5 2xl:grid-cols-[300px_minmax(0,1fr)]"
              : "min-w-0"
          }
        >
          {showQueue && (
            <SupportQueue
              model={model}
              filters={filters}
              onFilters={onFilters}
              staff={isStaff}
              compact={layout === "inbox"}
              selected={selected}
              backTo={queuePath}
              onSelect={preview || layout === "inbox" ? choose : undefined}
              previewPath={preview ? previewPath : undefined}
            />
          )}
          {(showTicket || layout === "inbox") && ticketContent}
        </div>
      )}
      <SupportTicketForm
        open={creating}
        busy={model.busy}
        services={model.services}
        onClose={() => setCreating(false)}
        create={(body) =>
          model.run(async () => {
            const result = await model.operations.create(body);
            setCreating(false);
            choose(result.id);
          })
        }
      />
    </div>
  );
}
