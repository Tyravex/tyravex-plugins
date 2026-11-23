import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/app/store/auth.store";
import { supportCenterApi } from "../api/supportCenterApi";
import { useSupportUpdates } from "./useSupportUpdates";

export function useSupportUnreadCount(staff: boolean, enabled: boolean) {
  useSupportUpdates();
  const actor = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: ["support-unread", actor?.id, staff],
    queryFn: () => supportCenterApi.unread(staff),
    enabled:
      enabled &&
      !!actor &&
      (!staff || actor.permissions.includes("support:read")),
    retry: false,
    staleTime: 10000,
    refetchInterval: (query) => (query.state.error ? false : 20000),
  });
}
