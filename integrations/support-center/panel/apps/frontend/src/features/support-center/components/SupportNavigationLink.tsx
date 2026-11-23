import { Headset } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuthStore } from "@/app/store/auth.store";
import { useSupportAvailability } from "../hooks/useSupportAvailability";
import { useSupportTranslation } from "../lib/useSupportTranslation";
import { useSupportUnreadCount } from "../hooks/useSupportUnreadCount";

export function SupportNavigationLink({
  staff,
  onNavigate,
}: {
  staff: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useSupportTranslation();
  const canRead = useAuthStore(
    (state) => !!state.user?.permissions.includes("support:read"),
  );
  const availability = useSupportAvailability();
  const unread = useSupportUnreadCount(
    staff,
    !!availability.data?.enabled && availability.data.ready !== false,
  );
  if (!availability.data?.enabled || (staff && !canRead)) return null;
  return (
    <NavLink
      to={staff ? "/admin/support" : "/support"}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium ${isActive ? "bg-primary/15 text-primary" : "text-text-secondary hover:bg-white/5"}`
      }
    >
      <Headset size={17} />
      {t(staff ? "staffTitle" : "title")}
      {!!unread.data?.tickets && (
        <span
          aria-label={t("unreadTickets", { count: unread.data.tickets })}
          className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] text-white"
        >
          {unread.data.tickets > 99 ? "99+" : unread.data.tickets}
        </span>
      )}
    </NavLink>
  );
}
