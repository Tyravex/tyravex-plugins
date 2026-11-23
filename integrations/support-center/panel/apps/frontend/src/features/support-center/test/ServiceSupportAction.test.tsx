// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ServiceSupportAction } from "../components/ServiceSupportAction";
import { supportCenterApi } from "../api/supportCenterApi";

const state = vi.hoisted(() => ({
  actorId: 7,
  enabled: true,
  navigate: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => state.navigate }));
vi.mock("@/app/store/auth.store", () => ({
  useAuthStore: (select: (state: { user: { id: number } }) => unknown) =>
    select({ user: { id: state.actorId } }),
}));
vi.mock("../hooks/useSupportAvailability", () => ({
  useSupportAvailability: () => ({
    data: { enabled: state.enabled },
    isError: false,
  }),
}));
vi.mock("../api/supportCenterApi", () => ({
  supportCenterApi: { create: vi.fn() },
}));
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  state.actorId = 7;
  state.enabled = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <ServiceSupportAction
        service={{ id: "discord-service", name: "Discord Bot", userId: 7 }}
      />
    </QueryClientProvider>,
  );
const fill = () => {
  fireEvent.click(screen.getByRole("button", { name: "callSupport" }));
  fireEvent.change(screen.getByLabelText("subject"), {
    target: { value: "Startup issue" },
  });
  fireEvent.change(screen.getByLabelText("message"), {
    target: { value: "Please help with startup" },
  });
};

it("binds the ticket to the current service and navigates to its conversation after explicit submission", async () => {
  vi.mocked(supportCenterApi.create).mockResolvedValue({ id: "new-ticket" });
  mount();
  expect(supportCenterApi.create).not.toHaveBeenCalled();
  fill();
  expect((screen.getByLabelText("service") as HTMLSelectElement).disabled).toBe(
    true,
  );
  expect(screen.getByRole("option").textContent).toBe(
    "Discord Bot — discord-service",
  );
  expect(screen.getByText("callSupportHelp")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await waitFor(() =>
    expect(state.navigate).toHaveBeenCalledWith("/support/tickets/new-ticket"),
  );
  expect(supportCenterApi.create).toHaveBeenCalledWith({
    serviceId: "discord-service",
    subject: "Startup issue",
    body: "Please help with startup",
  });
});
it("hides the action when the plugin is disabled", () => {
  state.enabled = false;
  mount();
  expect(screen.queryByRole("button")).toBeNull();
  expect(supportCenterApi.create).not.toHaveBeenCalled();
});
it("hides the action from non-owners", () => {
  state.actorId = 8;
  mount();
  expect(screen.queryByRole("button")).toBeNull();
  expect(supportCenterApi.create).not.toHaveBeenCalled();
});
it("keeps the entered message when creating a ticket fails", async () => {
  vi.mocked(supportCenterApi.create).mockRejectedValue(
    new Error("Network failure"),
  );
  mount();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("message") as HTMLTextAreaElement).value).toBe(
    "Please help with startup",
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(state.navigate).not.toHaveBeenCalled();
});
