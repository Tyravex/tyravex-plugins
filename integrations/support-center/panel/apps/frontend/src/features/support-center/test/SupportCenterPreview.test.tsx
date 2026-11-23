// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { SupportCenterPage } from "@/pages/support/SupportCenterPage";
import { supportCenterApi } from "../api/supportCenterApi";
vi.mock("@/features/auth/model/refreshCurrentUser", () => ({
  refreshCurrentUser: vi.fn(),
}));

vi.mock("@/app/store/auth.store", () => ({
  useAuthStore: (
    select: (state: { user: { id: number; permissions: string[] } }) => unknown,
  ) =>
    select({ user: { id: 1, permissions: ["plugin:read", "plugin:manage"] } }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("../api/supportCenterApi", () => ({
  supportCenterApi: {
    availability: vi.fn(),
    list: vi.fn(),
    services: vi.fn(),
    detail: vi.fn(),
    create: vi.fn(),
    workspace: vi.fn(),
    staffList: vi.fn(),
  },
}));
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
});
function mount() {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SupportCenterPage preview />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("isolates internal staff notes when switching to the client perspective", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "staffView" }));
  fireEvent.click(screen.getByRole("link", { name: /sampleSubject/ }));
  fireEvent.click(screen.getByLabelText("internalNote"));
  fireEvent.change(screen.getByLabelText("message"), {
    target: { value: "Private staff-only finding" },
  });
  fireEvent.click(screen.getByRole("button", { name: "addNote" }));
  await screen.findByText("Private staff-only finding");
  fireEvent.click(screen.getByRole("button", { name: "clientView" }));
  await waitFor(() =>
    expect(screen.queryByText("Private staff-only finding")).toBeNull(),
  );
  expect(screen.queryByLabelText("internalNote")).toBeNull();
  for (const method of Object.values(supportCenterApi))
    expect(method).not.toHaveBeenCalled();
});

it("previews consent and revocation without calling any backend API", async () => {
  mount();
  expect(screen.getByText("previewNote")).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: /sampleSubject/ }));
  fireEvent.click(screen.getByText("detailsAndAccess"));
  fireEvent.click(screen.getByRole("button", { name: "approve" }));
  await screen.findByText("grant_ACTIVE");
  fireEvent.click(screen.getByRole("button", { name: "revoke" }));
  await screen.findByText("grant_REVOKED");
  for (const method of Object.values(supportCenterApi))
    expect(method).not.toHaveBeenCalled();
});

it("supports staff perspective, conversation and history in an isolated preview", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "staffView" }));
  fireEvent.click(screen.getByRole("link", { name: /sampleSubject/ }));
  fireEvent.change(screen.getByLabelText("message"), {
    target: { value: "Preview response" },
  });
  fireEvent.click(screen.getByRole("button", { name: "send" }));
  await screen.findByText("Preview response");
  fireEvent.click(screen.getByRole("button", { name: "history" }));
  expect(screen.getByText("event_MESSAGE_ADDED")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "resolve" }));
  await screen.findByText("event_STATUS_RESOLVED");
  fireEvent.click(screen.getByText("detailsAndAccess"));
  expect(screen.getByText("grant_REVOKED")).toBeTruthy();
});

it("creates a preview ticket and drops preview data on reset", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "newTicket" }));
  fireEvent.change(screen.getByLabelText("subject"), {
    target: { value: "Preview ticket" },
  });
  fireEvent.change(screen.getByLabelText("message"), {
    target: { value: "Local sample body" },
  });
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    await screen.findByRole("heading", { name: "Preview ticket" }),
  ).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "reset" }));
  });
  expect(screen.queryByText("Preview ticket")).toBeNull();
  expect(supportCenterApi.create).not.toHaveBeenCalled();
});
