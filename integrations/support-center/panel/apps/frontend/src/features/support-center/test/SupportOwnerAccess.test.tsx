// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SupportAccessPanel } from "../components/SupportAccessPanel";
import type { ComponentProps } from "react";
import { supportTicket } from "./fixtures/supportTicket";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
afterEach(cleanup);
const ticket = supportTicket({
  id: "ticket",
  ownerId: 1,
  status: "IN_PROGRESS",
  assignedStaffId: 4,
  assignedStaffName: "admin4",
  assignedStaffCanAccess: true,
  grants: [],
});
const mount = (
  props: Partial<ComponentProps<typeof SupportAccessPanel>> = {},
) =>
  render(
    <SupportAccessPanel
      ticket={ticket}
      actorId={1}
      staff={false}
      canRequest={false}
      busy={false}
      now={Date.now()}
      request={vi.fn()}
      decide={vi.fn()}
      {...props}
    />,
  );

it("lets the owner grant explicitly chosen scopes and duration to admin4 without a prior request", async () => {
  const grant = vi.fn().mockResolvedValue(undefined);
  mount({ grant });
  expect(screen.getByText(/admin4/)).toBeTruthy();
  expect(grant).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("reason"), {
    target: { value: "Please inspect my bot files" },
  });
  fireEvent.change(screen.getByLabelText("duration"), {
    target: { value: "30" },
  });
  fireEvent.click(screen.getByLabelText("scope_status"));
  fireEvent.click(screen.getByRole("button", { name: "grantAssigneeAccess" }));
  await waitFor(() =>
    expect(grant).toHaveBeenCalledWith(
      {
        staffId: 4,
        reason: "Please inspect my bot files",
        scopes: ["files:read"],
        durationMinutes: 30,
      },
      expect.any(Function),
    ),
  );
});

it("keeps staff requests available without allowing staff to grant themselves access", () => {
  mount({ actorId: 4, staff: true, canRequest: true, grant: vi.fn() });
  expect(screen.getByRole("button", { name: "requestAccess" })).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "grantAssigneeAccess" }),
  ).toBeNull();
});

it("explains missing account capability instead of silently hiding all actions", () => {
  mount({
    ticket: { ...ticket, assignedStaffCanAccess: false },
    grant: vi.fn(),
  });
  expect(screen.getByText("SUPPORT_STAFF_ACCESS_REQUIRED")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "grantAssigneeAccess" }),
  ).toBeNull();
});

it("allows approval of an existing request without offering duplicate direct consent", () => {
  const decide = vi.fn();
  mount({
    ticket: {
      ...ticket,
      grants: [
        {
          id: "pending",
          staffId: 4,
          staffName: "admin4",
          scopes: ["status"],
          reason: "Inspect service",
          status: "PENDING",
          durationMinutes: 30,
          expiresAt: null,
          createdAt: "2026-11-22T10:00:00Z",
        },
      ],
    },
    grant: vi.fn(),
    decide,
  });
  expect(
    screen.queryByRole("button", { name: "grantAssigneeAccess" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "approve" }));
  expect(decide).toHaveBeenCalledWith("pending", "APPROVE");
});
