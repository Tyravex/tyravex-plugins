import { api } from "@/shared/api/client";

import type {
  CreateMarketplaceRepositoryRequest,
  MarketplaceRepositoriesResponse,
  MarketplaceRepository,
  MarketplaceRegistry,
  UpdateMarketplaceRepositoryRequest,
} from "@shared/types";

const baseUrl = "/admin/plugins/marketplace/repositories";

export const marketplaceApi = {
  async listRepositories(
    signal?: AbortSignal,
  ): Promise<MarketplaceRepositoriesResponse> {
    const response = await api.get<MarketplaceRepositoriesResponse>(baseUrl, {
      signal,
    });

    return response.data;
  },

  async listRepositoryPlugins(
    id: string,
    signal?: AbortSignal,
    refresh = false,
  ): Promise<MarketplaceRegistry> {
    const response = await api.get<MarketplaceRegistry>(
      `${baseUrl}/${encodeURIComponent(id)}/plugins`,
      { signal, params: refresh ? { refresh: true } : undefined },
    );

    return response.data;
  },

  async createRepository(
    data: CreateMarketplaceRepositoryRequest,
  ): Promise<MarketplaceRepository> {
    const response = await api.post<MarketplaceRepository>(baseUrl, data);

    return response.data;
  },

  async updateRepository(
    id: string,
    data: UpdateMarketplaceRepositoryRequest,
  ): Promise<MarketplaceRepository> {
    const response = await api.patch<MarketplaceRepository>(
      `${baseUrl}/${encodeURIComponent(id)}`,
      data,
    );

    return response.data;
  },

  async deleteRepository(id: string): Promise<void> {
    await api.delete(`${baseUrl}/${encodeURIComponent(id)}`);
  },
};
