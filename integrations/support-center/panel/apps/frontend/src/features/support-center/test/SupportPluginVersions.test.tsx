// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SupportPluginCard } from "../components/SupportPluginCard";
import { supportCenterApi } from "../api/supportCenterApi";
import { supportCenterPlugin } from "@/plugins/support-center/manifest";
import type { LocalPlugin } from "../api/supportCenterApi";
import type { NativeMarketplacePlugin } from "@shared/types";

const state = vi.hoisted(() => ({
  permissions: ["plugin:read", "plugin:manage"],
}));
vi.mock("react-i18next", () => {
  const t = (key: string, options?: { version?: string }) =>
    options?.version ? `${key}:${options.version}` : key;
  return { useTranslation: () => ({ t }) };
});
vi.mock("@/app/store/auth.store", () => ({
  useAuthStore: (
    select: (value: { user: { id: number; permissions: string[] } }) => unknown,
  ) => select({ user: { id: 1, permissions: state.permissions } }),
}));
vi.mock("@/shared/store/user", () => ({ useUser: {} }));
vi.mock("../api/supportCenterApi", () => ({
  supportCenterApi: {
    localCatalog: vi.fn(),
    install: vi.fn(),
    upgrade: vi.fn(),
  },
}));
vi.mock("@/features/plugins/api/marketplaceApi", () => ({
  marketplaceApi: { listRepositoryPlugins: vi.fn() },
}));
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  state.permissions = ["plugin:read", "plugin:manage"];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
});
async function mount(
  installed: LocalPlugin["installed"],
  publishedVersion: string | null,
  compiledVersion = supportCenterPlugin.version,
) {
  vi.mocked(supportCenterApi.localCatalog).mockResolvedValue([
    {
      manifest: { ...supportCenterPlugin, version: compiledVersion },
      source: "BUNDLED",
      installed,
    },
  ]);
  const publication: NativeMarketplacePlugin = {
    id: supportCenterPlugin.id,
    name: "Support Center",
    runtime: "native",
    type: "integration",
    path: "integrations/support-center",
    repositoryUrl: "https://github.com/Tyravex/tyravex-plugins",
    languages: ["en"],
    publishedVersion,
    compiledVersion: supportCenterPlugin.version,
  };
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SupportPluginCard publication={publication} compact />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.queryByText("loading")).toBeNull());
}
it("shows published, server build and installed versions independently", async () => {
  await mount({ status: "INSTALLED", version: "0.3.0" }, "0.3.1");
  expect(screen.getByText("publishedVersion:0.3.1")).toBeTruthy();
  expect(
    screen.getByText(`compiledVersion:${supportCenterPlugin.version}`),
  ).toBeTruthy();
  expect(screen.getByText("installedVersion:0.3.0")).toBeTruthy();
  expect(screen.queryByText("draft")).toBeNull();
  expect(screen.getByRole("button", { name: "upgradePlugin" })).toBeTruthy();
  expect(supportCenterApi.upgrade).not.toHaveBeenCalled();
});
it("does not offer a source-only update or trust the newer frontend over the backend build", async () => {
  await mount({ status: "INSTALLED", version: "0.3.0" }, "9.0.0", "0.3.0");
  expect(screen.getByText("compiledVersion:0.3.0")).toBeTruthy();
  expect(screen.getByText("nativeBuildRequired")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "upgradePlugin" })).toBeNull();
});
it("does not offer to downgrade an installation from a newer build", async () => {
  await mount({ status: "INSTALLED", version: "9.0.0" }, "0.3.1");
  expect(screen.queryByRole("button", { name: "upgradePlugin" })).toBeNull();
});
it("reports unknown publication status without hiding confirmed bundled installation", async () => {
  await mount(null, null);
  expect(screen.getByText("publicationUnknown")).toBeTruthy();
  expect(screen.getByRole("button", { name: "install" })).toBeTruthy();
  expect(supportCenterApi.install).not.toHaveBeenCalled();
});
it("preserves preview for read-only admins without granting installation rights", async () => {
  state.permissions = ["plugin:read"];
  await mount(null, "0.3.1");
  expect(screen.getByRole("link", { name: "preview" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "install" })).toBeNull();
});
