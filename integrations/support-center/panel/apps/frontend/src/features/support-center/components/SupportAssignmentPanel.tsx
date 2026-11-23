import { useState } from "react";
import type { SupportTicket } from "@shared/types";
import type { useSupportCenter } from "../hooks/useSupportCenter";
import { useSupportTranslation } from "../lib/useSupportTranslation";

export function SupportAssignmentPanel({
  ticket,
  model,
  staff,
  embedded = false,
}: {
  ticket: Pick<
    SupportTicket,
    "id" | "ownerId" | "status" | "assignedStaffId" | "assignedStaffName"
  >;
  model: Pick<
    ReturnType<typeof useSupportCenter>,
    "staffMembers" | "actorId" | "canManage" | "busy" | "run"
  > & {
    operations: Pick<
      ReturnType<typeof useSupportCenter>["operations"],
      "claim" | "assign"
    >;
  };
  staff: boolean;
  embedded?: boolean;
}) {
  const { t } = useSupportTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const value = selected ?? String(ticket.assignedStaffId ?? "");
  const members = model.staffMembers;
  return (
    <div
      className={
        embedded
          ? "space-y-2"
          : "space-y-2 rounded-xl border border-border-subtle bg-background/40 p-3"
      }
    >
      <p className="text-xs text-text-secondary">
        {t("assignee")}:{" "}
        <span className="font-semibold text-text-primary">
          {ticket.assignedStaffName ?? t("unassigned")}
        </span>
      </p>
      {staff &&
        model.canManage &&
        ["OPEN", "IN_PROGRESS"].includes(ticket.status) && (
          <div className="flex flex-wrap gap-2">
            {!ticket.assignedStaffId && (
              <button
                disabled={model.busy}
                onClick={() =>
                  void model.run(() => model.operations.claim(ticket.id))
                }
                className="rounded-lg bg-primary/15 px-3 py-2 text-xs text-primary"
              >
                {t("claim")}
              </button>
            )}
            <select
              aria-label={t("assignee")}
              value={value}
              onChange={(event) => setSelected(event.target.value)}
              disabled={model.busy}
              className="min-w-0 rounded-lg border border-border-subtle bg-background px-2 py-2 text-xs"
            >
              <option value="">{t("unassigned")}</option>
              {ticket.assignedStaffId &&
                !members.some(
                  (member) => member.id === ticket.assignedStaffId,
                ) && (
                  <option value={ticket.assignedStaffId}>
                    {ticket.assignedStaffName}
                  </option>
                )}
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.username}
                </option>
              ))}
            </select>
            <button
              disabled={
                model.busy || value === String(ticket.assignedStaffId ?? "")
              }
              onClick={() =>
                void model.run(
                  () =>
                    model.operations.assign(
                      ticket.id,
                      value ? Number(value) : null,
                    ),
                  () => setSelected(null),
                )
              }
              className="rounded-lg border border-border-subtle px-3 py-2 text-xs disabled:opacity-40"
            >
              {t("transfer")}
            </button>
          </div>
        )}
    </div>
  );
}
