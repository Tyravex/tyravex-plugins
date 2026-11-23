// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SupportCenterPage } from "@/pages/support/SupportCenterPage";
import { SupportTicketPage } from "@/pages/support/SupportTicketPage";
import { supportCenterApi } from "../api/supportCenterApi";
import { supportTicket } from "./fixtures/supportTicket";

vi.mock("@/features/auth/model/refreshCurrentUser", () => ({
  refreshCurrentUser: vi.fn(),
}));

vi.mock("@/app/store/auth.store", () => ({
  useAuthStore: (
    select: (state: { user: { id: number; permissions: string[] } }) => unknown,
  ) =>
    select({
      user: {
        id: 1,
        permissions: ["support:read", "support:manage", "support:access"],
      },
    }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("../api/supportCenterApi", () => ({
  supportCenterApi: {
    availability: vi.fn(),
    list: vi.fn(),
    detail: vi.fn(),
    services: vi.fn(),
    staffList: vi.fn(),
    markRead: vi.fn(),
  },
}));

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(supportCenterApi.availability).mockResolvedValue({
    enabled: true,
    ready: true,
  });
  vi.mocked(supportCenterApi.list).mockResolvedValue({
    items: [supportTicket()],
    total: 30,
    page: 2,
    limit: 25,
    counts: { OPEN: 30, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 },
  });
  vi.mocked(supportCenterApi.detail).mockResolvedValue(supportTicket());
  vi.mocked(supportCenterApi.services).mockResolvedValue([
    { id: "service", name: "Bot" },
  ]);
  vi.mocked(supportCenterApi.staffList).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  client.clear();
});
function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
function mount(entry = "/support") {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Location />
        <Routes>
          <Route path="/support" element={<SupportCenterPage />} />
          <Route
            path="/support/tickets/:ticketId"
            element={<SupportTicketPage />}
          />
          <Route path="/admin/support" element={<SupportCenterPage staff />} />
          <Route
            path="/admin/support/tickets/:ticketId"
            element={<SupportTicketPage staff />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("opens a conversation at its own URL and restores queue filters and page on return", async () => {
  const original = "/support?status=OPEN&page=2&serviceId=service";
  mount(original);
  const link = await screen.findByRole("link", { name: /Startup issue/ });
  expect(link.getAttribute("href")).toBe("/support/tickets/ticket");
  fireEvent.click(link);
  await screen.findByRole("heading", { name: "Startup issue" });
  expect(screen.getByTestId("location").textContent).toBe(
    "/support/tickets/ticket",
  );
  fireEvent.click(screen.getByRole("link", { name: "backToTickets" }));
  await screen.findByRole("link", { name: /Startup issue/ });
  expect(screen.getByTestId("location").textContent).toBe(original);
  expect(supportCenterApi.list).toHaveBeenCalledWith(
    false,
    expect.objectContaining({ status: "OPEN", page: 2, serviceId: "service" }),
  );
});

it("loads a directly linked ticket without downloading the queue or service selector", async () => {
  mount("/support/tickets/ticket");
  await screen.findByRole("heading", { name: "Startup issue" });
  expect(supportCenterApi.detail).toHaveBeenCalledWith("ticket", false);
  expect(supportCenterApi.list).not.toHaveBeenCalled();
  expect(supportCenterApi.services).not.toHaveBeenCalled();
  expect(
    screen.getByRole("link", { name: "backToTickets" }).getAttribute("href"),
  ).toBe("/support");
});

it("keeps older notification links working with a canonical redirect", async () => {
  mount("/support?status=OPEN&ticket=ticket");
  await screen.findByRole("heading", { name: "Startup issue" });
  expect(screen.getByTestId("location").textContent).toBe(
    "/support/tickets/ticket",
  );
  expect(
    screen.getByRole("link", { name: "backToTickets" }).getAttribute("href"),
  ).toBe("/support?status=OPEN");
});

it("selects tickets inline in the staff inbox and preserves filters when switching layouts", async () => {
  mount("/admin/support?view=inbox&status=OPEN&page=2");
  fireEvent.click(await screen.findByRole("link", { name: /Startup issue/ }));
  await screen.findByRole("heading", { name: "Startup issue" });
  expect(
    screen
      .getByRole("link", { name: /Startup issue/ })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(screen.getByTestId("location").textContent).toBe(
    "/admin/support?view=inbox&status=OPEN&page=2&ticket=ticket",
  );
  fireEvent.click(screen.getByRole("button", { name: "layoutList" }));
  await waitFor(() =>
    expect(screen.getByTestId("location").textContent).toBe(
      "/admin/support/tickets/ticket",
    ),
  );
  fireEvent.click(screen.getByRole("link", { name: "backToTickets" }));
  await screen.findByRole("link", { name: /Startup issue/ });
  expect(screen.getByTestId("location").textContent).toBe(
    "/admin/support?status=OPEN&page=2",
  );
});

it("shows a useful failure state for an unavailable ticket without enabling operations", async () => {
  vi.mocked(supportCenterApi.detail).mockRejectedValue(new Error("Forbidden"));
  mount("/support/tickets/missing");
  await screen.findByText("ticketUnavailable");
  expect(screen.getByRole("alert").textContent).toBe("error");
  expect(screen.queryByLabelText("message")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "grantAssigneeAccess" }),
  ).toBeNull();
});
