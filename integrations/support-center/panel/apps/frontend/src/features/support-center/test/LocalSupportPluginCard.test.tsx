// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { LocalSupportPluginCard } from "../components/LocalSupportPluginCard";
import { supportCenterApi } from "../api/supportCenterApi";
import { supportCenterPlugin } from "@/plugins/support-center/manifest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/app/store/auth.store", () => ({
  useAuthStore: (
    select: (state: { user: { id: number; permissions: string[] } }) => unknown,
  ) =>
    select({ user: { id: 1, permissions: ["plugin:read", "plugin:manage"] } }),
}));
vi.mock("@/shared/store/user", () => ({ useUser: {} }));
vi.mock("../hooks/useSupportPublication", () => ({
  useSupportPublication: () => ({
    entry: { publishedVersion: "0.3.1", compiledVersion: "0.3.1" },
    loading: false,
  }),
}));
vi.mock("../api/supportCenterApi", () => ({
  supportCenterApi: {
    localCatalog: vi.fn(),
    install: vi.fn(),
    uninstall: vi.fn(),
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("shows the official source preview while requiring explicit confirmation before installation", async () => {
  vi.mocked(supportCenterApi.localCatalog).mockResolvedValue([
    {
      manifest: supportCenterPlugin,
      source: "BUNDLED",
      installed: null,
    },
  ]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LocalSupportPluginCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole("link", { name: "preview" }).getAttribute("href"),
  ).toBe("/admin/plugins/local/support-center/preview");
  fireEvent.click(await screen.findByRole("button", { name: "install" }));
  expect(screen.getByText("installHelp")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "confirm" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("confirmation"), {
    target: { value: "tyravex.support-center" },
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "confirm" }).hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(supportCenterApi.install).not.toHaveBeenCalled();
  expect(supportCenterApi.uninstall).not.toHaveBeenCalled();
  client.clear();
});
