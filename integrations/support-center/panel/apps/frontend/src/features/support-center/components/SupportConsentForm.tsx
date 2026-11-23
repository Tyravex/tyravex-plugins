import { useState } from "react";
import { SUPPORT_SCOPES, type SupportScope } from "@shared/types";
import { useSupportTranslation } from "../lib/useSupportTranslation";

export type SupportConsentFields = {
  reason: string;
  scopes: SupportScope[];
  durationMinutes: number;
};

export function SupportConsentForm({
  busy,
  action,
  submit,
}: {
  busy: boolean;
  action: "requestAccess" | "grantAssigneeAccess";
  submit: (body: SupportConsentFields, onSuccess: () => void) => Promise<void>;
}) {
  const { t } = useSupportTranslation();
  const [reason, setReason] = useState("");
  const [durationMinutes, setDuration] = useState(60);
  const [scopes, setScopes] = useState<SupportScope[]>([
    "status",
    "files:read",
  ]);
  return (
    <form
      className="space-y-4 rounded-xl border border-border-subtle p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit({ reason, scopes, durationMinutes }, () => setReason(""));
      }}
    >
      <h3 className="font-semibold">{t(action)}</h3>
      <label className="block space-y-2 text-sm">
        <span>{t("reason")}</span>
        <textarea
          required
          minLength={10}
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-24 w-full rounded-xl border border-border-subtle bg-background p-3"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm">{t("scopes")}</legend>
        {SUPPORT_SCOPES.map((scope) => (
          <label key={scope} className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={scopes.includes(scope)}
              onChange={(event) =>
                setScopes((current) =>
                  event.target.checked
                    ? [...current, scope]
                    : current.filter((value) => value !== scope),
                )
              }
            />
            {t(`scope_${scope.replace(":", "_")}`)}
          </label>
        ))}
      </fieldset>
      <p className="text-xs leading-5 text-amber-300">{t("secretWarning")}</p>
      <label className="block space-y-2 text-sm">
        <span>{t("duration")}</span>
        <select
          className="rounded-xl border border-border-subtle bg-background p-3"
          value={durationMinutes}
          onChange={(event) => setDuration(Number(event.target.value))}
        >
          {[15, 30, 60, 120, 240].map((value) => (
            <option key={value} value={value}>
              {t("minutes", { count: value })}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={
          busy ||
          !scopes.length ||
          reason.trim().length < 10 ||
          (scopes.includes("secrets") &&
            !scopes.some((scope) => scope.startsWith("files:")))
        }
        className="rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-40"
      >
        {t(action)}
      </button>
    </form>
  );
}
