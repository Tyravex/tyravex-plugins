import { useSupportAvailability } from "../hooks/useSupportAvailability";
import { useSupportTranslation } from "../lib/useSupportTranslation";

export function SupportPermissionStatus() {
  const { t } = useSupportTranslation();
  const state = useSupportAvailability();
  const text = state.isError
    ? "stateUnknown"
    : state.isPending
      ? "loading"
      : state.data?.enabled && state.data.ready === false
        ? "SUPPORT_UPGRADE_REQUIRED"
        : state.data?.enabled
          ? "permissionsActive"
          : "permissionsInactive";
  return (
    <p
      role="status"
      className={`mb-4 rounded-lg border px-3 py-2 text-xs leading-5 ${state.data?.enabled ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-300" : "border-amber-400/20 bg-amber-400/5 text-amber-300"}`}
    >
      {t(text)}
    </p>
  );
}
