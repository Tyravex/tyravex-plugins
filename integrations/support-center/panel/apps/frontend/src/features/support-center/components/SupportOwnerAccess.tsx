import type { SupportTicket } from "@shared/types";
import {
  SupportConsentForm,
  type SupportConsentFields,
} from "./SupportConsentForm";
import { useSupportTranslation } from "../lib/useSupportTranslation";
import { useAuthStore } from "@/app/store/auth.store";
import { Link } from "react-router-dom";

export function SupportOwnerAccess({
  ticket,
  actorId,
  busy,
  now,
  grant,
}: {
  ticket: SupportTicket;
  actorId: number;
  busy: boolean;
  now: number;
  grant: (
    body: SupportConsentFields & { staffId: number },
    onSuccess: () => void,
  ) => Promise<void>;
}) {
  const { t } = useSupportTranslation();
  const canViewStaffRoles = useAuthStore(
    (state) =>
      !!state.user &&
      ["user:read", "role:read"].every((name) =>
        state.user!.permissions.includes(name),
      ),
  );
  if (
    ticket.ownerId !== actorId ||
    !["OPEN", "IN_PROGRESS"].includes(ticket.status)
  )
    return null;
  if (!ticket.assignedStaffId)
    return (
      <p className="text-sm text-text-secondary">
        {t("ownerAccessNoAssignee")}
      </p>
    );
  if (ticket.assignedStaffId === actorId)
    return (
      <p className="text-sm text-text-secondary">
        {t("SUPPORT_SELF_ACCESS_DENIED")}
      </p>
    );
  if (ticket.assignedStaffCanAccess === false)
    return (
      <div className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm leading-6 text-amber-300">
        <p>{t("SUPPORT_STAFF_ACCESS_REQUIRED")}</p>
        {canViewStaffRoles && (
          <Link
            className="inline-block underline"
            to={`/admin/users/${ticket.assignedStaffId}/roles`}
          >
            {t("staffRoleSettings")}
          </Link>
        )}
      </div>
    );
  const current = ticket.grants.some(
    (item) =>
      item.staffId === ticket.assignedStaffId &&
      (item.status === "PENDING" ||
        (item.status === "ACTIVE" &&
          !!item.expiresAt &&
          Date.parse(item.expiresAt) > now)),
  );
  if (current) return null;
  return (
    <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-semibold">
        {t("accessRecipient")}: {ticket.assignedStaffName} · #
        {ticket.assignedStaffId}
      </p>
      <p className="text-sm leading-6 text-text-secondary">
        {t("grantAssigneeHelp")}
      </p>
      <SupportConsentForm
        key={ticket.assignedStaffId}
        busy={busy}
        action="grantAssigneeAccess"
        submit={(body, onSuccess) =>
          grant({ ...body, staffId: ticket.assignedStaffId! }, onSuccess)
        }
      />
    </section>
  );
}
