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
import { PluginRoleBindingPanel } from "../components/PluginRoleBindingPanel";
import { supportCenterApi } from "../api/supportCenterApi";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/app/store/auth.store", () => ({
  useAuthStore: (
    select: (state: { user: { id: number; permissions: string[] } }) => unknown,
  ) =>
    select({
      user: {
        id: 1,
        permissions: [
          "role:read",
          "role:manage",
          "plugin:read",
          "plugin:manage",
        ],
      },
    }),
}));
vi.mock("../api/supportCenterApi", () => ({
  supportCenterApi: {
    roleCandidates: vi.fn(),
    bindRole: vi.fn(),
    enableTicketRole: vi.fn(),
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("explains and repairs missing Support ticket permissions only after exact role confirmation", async () => {
  vi.mocked(supportCenterApi.roleCandidates).mockResolvedValue([
    {
      id: "legacy-support",
      name: "Support",
      managed: true,
      permissions: ["user:read"],
    },
  ]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PluginRoleBindingPanel />
    </QueryClientProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "enableTicketRole" }),
  );
  expect(screen.getByText("enableTicketRoleHelp")).toBeTruthy();
  expect(supportCenterApi.enableTicketRole).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("roleIdConfirmation"), {
    target: { value: "legacy-support" },
  });
  fireEvent.click(screen.getByRole("button", { name: "confirm" }));
  await waitFor(() =>
    expect(supportCenterApi.enableTicketRole).toHaveBeenCalledWith(
      "legacy-support",
      "legacy-support",
    ),
  );
  expect(supportCenterApi.bindRole).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  client.clear();
});

it("requires the exact role ID and an explicit confirmation before applying ownership metadata", async () => {
  vi.mocked(supportCenterApi.roleCandidates).mockResolvedValue([
    { id: "support-role-id", name: "Support", managed: false },
  ]);
  vi.mocked(supportCenterApi.bindRole).mockResolvedValue({ protected: true });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PluginRoleBindingPanel />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "bindRole" }));
  expect(screen.getByText("bindRoleHelp")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "confirm" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("roleIdConfirmation"), {
    target: { value: "wrong-id" },
  });
  expect(
    screen.getByRole("button", { name: "confirm" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(supportCenterApi.bindRole).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("roleIdConfirmation"), {
    target: { value: "support-role-id" },
  });
  fireEvent.click(screen.getByRole("button", { name: "confirm" }));
  await waitFor(() =>
    expect(supportCenterApi.bindRole).toHaveBeenCalledWith(
      "support-role-id",
      "support-role-id",
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  client.clear();
});
