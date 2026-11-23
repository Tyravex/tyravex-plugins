import type { NativeMarketplaceCatalog } from "./native-marketplace.types";

export type MarketplacePluginType =
  | "language"
  | "theme"
  | "integration"
  | "billing"
  | "notification"
  | "other";

export type MarketplacePluginSource = "official" | "community";

export interface MarketplacePlugin {
  id: string;
  name: string;
  description: string;
  type: string;
  version: string;
  downloadUrl: string;
  sha256: string;
  category?: string;
  source?: string;
}

export interface MarketplaceRegistry {
  schemaVersion: 1;
  plugins: MarketplacePlugin[];
  nativeCatalog?: NativeMarketplaceCatalog;
}
