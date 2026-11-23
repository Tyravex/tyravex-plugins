// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarketplaceRepositoryDetails } from "../MarketplaceRepositoryDetails";
import { marketplaceApi } from "../../api/marketplaceApi";
import type { MarketplaceRepository } from "@shared/types";
vi.mock("react-i18next", () => {
  const t = (key: string, options?: { count?: number }) =>
    options?.count !== undefined ? `${key}:${options.count}` : key;
  return { useTranslation: () => ({ t }) };
});
vi.mock("../../api/marketplaceApi", () => ({
  marketplaceApi: { listRepositoryPlugins: vi.fn() },
}));
vi.mock("../NativeMarketplacePluginCard", () => ({
  NativeMarketplacePluginCard: ({ plugin }: { plugin: { name: string } }) => (
    <article>{plugin.name}</article>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const repository: MarketplaceRepository = {
  id: "official",
  name: "Tyravex Official",
  isOfficial: true,
  status: "ENABLED",
  url: "https://raw.githubusercontent.com/Tyravex/tyravex-plugins/main/registry.json",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const result = {
  schemaVersion: 1 as const,
  plugins: [
    {
      id: "language",
      name: "German",
      description: "Language pack",
      type: "language",
      version: "1.1.1",
      sha256: "a".repeat(64),
      downloadUrl:
        "https://github.com/Tyravex/tyravex-plugins/releases/download/test/file.zip",
    },
  ],
  nativeCatalog: {
    status: "AVAILABLE" as const,
    plugins: [
      {
        id: "tyravex.support-center",
        name: "Support Center",
        runtime: "native" as const,
        type: "integration" as const,
        repositoryUrl: "https://github.com/Tyravex/tyravex-plugins",
        path: "integrations/support-center",
        languages: ["en"],
        publishedVersion: "0.3.1",
        compiledVersion: "0.3.1",
      },
    ],
  },
};
it("lists the native plugin once beside the language package and counts both", async () => {
  vi.mocked(marketplaceApi.listRepositoryPlugins).mockResolvedValue(result);
  render(
    <MarketplaceRepositoryDetails repository={repository} onBack={vi.fn()} />,
  );
  expect(await screen.findByText("Support Center")).toBeTruthy();
  expect(screen.getAllByText("Support Center")).toHaveLength(1);
  expect(screen.getByText("German")).toBeTruthy();
  expect(screen.getByText("adminPlugins.categories.count:2")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", {
      name: "adminPlugins.repositories.refreshPlugins",
    }),
  );
  await waitFor(() =>
    expect(marketplaceApi.listRepositoryPlugins).toHaveBeenLastCalledWith(
      "official",
      expect.any(AbortSignal),
      true,
    ),
  );
});
it("does not promote community metadata to a trusted native plugin", async () => {
  vi.mocked(marketplaceApi.listRepositoryPlugins).mockResolvedValue(result);
  render(
    <MarketplaceRepositoryDetails
      repository={{ ...repository, id: "community", isOfficial: false }}
      onBack={vi.fn()}
    />,
  );
  await screen.findByText("German");
  expect(screen.queryByText("Support Center")).toBeNull();
  expect(screen.getByText("adminPlugins.categories.count:1")).toBeTruthy();
});
