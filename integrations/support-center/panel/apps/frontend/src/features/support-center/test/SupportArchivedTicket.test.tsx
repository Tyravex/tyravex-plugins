// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { SupportTicketDetail } from "../components/SupportTicketDetail";
import { supportTicket } from "./fixtures/supportTicket";
import type { ComponentProps } from "react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
afterEach(cleanup);

it.each([false, true])(
  "keeps archived conversations/history readable without reopening or access controls (staff=%s)",
  (staff) => {
    const run = vi.fn();
    const model = {
      actorId: staff ? 4 : 1,
      canManage: true,
      canRequest: true,
      busy: false,
      staffMembers: [],
      run,
      operations: { markRead: vi.fn().mockResolvedValue(undefined) },
    } as unknown as ComponentProps<typeof SupportTicketDetail>["model"];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SupportTicketDetail
          ticket={supportTicket({
            status: "CLOSED",
            archivedAt: "2026-11-22T12:00:00Z",
            messages: [
              {
                id: "message",
                authorId: 1,
                authorName: "client",
                body: "Retained conversation",
                createdAt: "2026-11-22T11:00:00Z",
              },
            ],
            events: [
              {
                id: "event",
                actorName: "System",
                action: "SERVICE_ARCHIVED",
                createdAt: "2026-11-22T12:00:00Z",
              },
            ],
          })}
          model={model}
          staff={staff}
          preview={true}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("archivedTicketHelp")).toBeTruthy();
    expect(screen.getByText("Retained conversation")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "reopen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "send" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "history" }));
    expect(screen.getByText("event_SERVICE_ARCHIVED")).toBeTruthy();
    fireEvent.click(screen.getByText("detailsAndAccess"));
    expect(screen.queryByRole("button", { name: "requestAccess" })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  },
);
