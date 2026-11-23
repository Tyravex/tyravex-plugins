// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SupportTicketDetail } from "../components/SupportTicketDetail";
import { supportTicket } from "./fixtures/supportTicket";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const message = (id: string) => ({
  id,
  body: `Client message ${id}`,
  authorId: 1,
  authorName: "client",
  createdAt: "2026-11-23T10:00:00Z",
});
function mount(overrides: Parameters<typeof supportTicket>[0] = {}) {
  const model = {
    actorId: 4,
    canManage: true,
    canRequest: true,
    busy: false,
    staffMembers: [],
    run: vi.fn(),
    operations: { markRead: vi.fn().mockResolvedValue(undefined) },
  } as unknown as ComponentProps<typeof SupportTicketDetail>["model"];
  const client = new QueryClient();
  let ticket = supportTicket({ messages: [message("one")], ...overrides });
  const view = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SupportTicketDetail ticket={ticket} model={model} staff preview />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const rendered = render(view());
  return {
    model,
    update: (value: Parameters<typeof supportTicket>[0]) => {
      ticket = { ...ticket, ...value };
      rendered.rerender(view());
    },
  };
}

it("retains the reply draft across history navigation and marks new replies read only when visible", async () => {
  const { model, update } = mount();
  await act(async () => {});
  expect(model.operations.markRead).toHaveBeenCalledWith("ticket", "one");
  fireEvent.change(screen.getByRole("textbox", { name: "message" }), {
    target: { value: "Draft reply" },
  });
  fireEvent.click(screen.getByRole("button", { name: "history" }));
  expect(screen.queryByRole("textbox", { name: "message" })).toBeNull();
  update({ messages: [message("one"), message("two")] });
  expect(model.operations.markRead).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "messages" }));
  expect(
    (screen.getByRole("textbox", { name: "message" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Draft reply");
  expect(model.operations.markRead).toHaveBeenCalledWith("ticket", "two");
});

it("opens service details and access as a disclosure on small screens", () => {
  mount();
  const summary = screen.getByText("detailsAndAccess");
  const details = summary.closest("details")!;
  expect(details.open).toBe(false);
  fireEvent.click(summary);
  expect(details.open).toBe(true);
  expect(screen.getByRole("button", { name: "requestAccess" })).toBeTruthy();
  fireEvent.click(summary);
  expect(details.open).toBe(false);
});

it("removes the service workspace immediately when a grant is revoked", () => {
  const grant = {
    id: "grant",
    staffId: 4,
    staffName: "operator",
    scopes: ["status" as const],
    reason: "Inspect status",
    status: "ACTIVE" as const,
    durationMinutes: 30,
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  const { update } = mount({ grants: [grant] });
  fireEvent.click(screen.getByRole("button", { name: "workspaceTab" }));
  expect(screen.getByText("previewWorkspace")).toBeTruthy();
  update({ grants: [{ ...grant, status: "REVOKED" }] });
  expect(screen.queryByText("previewWorkspace")).toBeNull();
  expect(screen.getByText("workspaceLockedHelp")).toBeTruthy();
});

it("locks the workspace on expiry without requiring a page refresh", () => {
  vi.useFakeTimers();
  mount({
    grants: [
      {
        id: "grant",
        staffId: 4,
        staffName: "operator",
        scopes: ["status"],
        reason: "Inspect status",
        status: "ACTIVE",
        durationMinutes: 15,
        expiresAt: new Date(Date.now() + 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
  });
  fireEvent.click(screen.getByRole("button", { name: "workspaceTab" }));
  expect(screen.getByText("previewWorkspace")).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(15000);
  });
  expect(screen.queryByText("previewWorkspace")).toBeNull();
  expect(screen.getByText("workspaceLockedHelp")).toBeTruthy();
});
