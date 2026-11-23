import type { NativeMarketplacePlugin } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/app/store/auth.store";
import { marketplaceApi } from "@/features/plugins/api/marketplaceApi";

export function useSupportPublication(
  publication?: NativeMarketplacePlugin | null,
) {
  const actor = useAuthStore((state) => state.user);
  const query = useQuery({
    queryKey: ["official-native-catalog", actor?.id],
    queryFn: ({ signal }) =>
      marketplaceApi.listRepositoryPlugins("official", signal),
    enabled:
      publication === undefined && !!actor?.permissions.includes("plugin:read"),
    retry: false,
    staleTime: 60_000,
  });
  return {
    entry:
      publication === undefined
        ? query.data?.nativeCatalog?.plugins.find(
            (entry) => entry.id === "tyravex.support-center",
          )
        : publication,
    loading: publication === undefined && query.isLoading,
  };
}
