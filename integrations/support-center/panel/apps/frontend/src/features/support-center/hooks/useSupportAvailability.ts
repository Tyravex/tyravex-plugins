import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/app/store/auth.store";
import { supportCenterApi } from "../api/supportCenterApi";

export function useSupportAvailability(enabled = true) {
  const actorId = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: ["support-availability", actorId],
    queryFn: supportCenterApi.availability,
    enabled: enabled && !!actorId,
    staleTime: 60000,
    retry: false,
  });
}
