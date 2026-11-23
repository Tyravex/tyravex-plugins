/** Published metadata never selects executable code; native code belongs to the panel build. */
export interface NativeMarketplacePlugin {
  id: string;
  name: string;
  runtime: "native";
  type: "integration";
  repositoryUrl: string;
  path: string;
  languages: string[];
  publishedVersion: string | null;
  compiledVersion: string | null;
}

export interface NativeMarketplaceCatalog {
  status: "AVAILABLE" | "UNAVAILABLE";
  plugins: NativeMarketplacePlugin[];
}
