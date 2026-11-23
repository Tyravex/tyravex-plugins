// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SupportAssignmentPanel } from "../components/SupportAssignmentPanel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(cleanup);

it("lets a permitted worker claim and select themselves on a ticket they authored", () => {
  const claim = vi.fn();
  render(
    <SupportAssignmentPanel
      staff
      ticket={{ id: "own-ticket", ownerId: 1, status: "OPEN" }}
      model={{
        actorId: 1,
        canManage: true,
        busy: false,
        staffMembers: [{ id: 1, username: "admin" }],
        run: async (operation: () => Promise<unknown>) => {
          await operation();
        },
        operations: { claim, assign: vi.fn() },
      }}
    />,
  );
  expect(screen.getByRole("option", { name: "admin" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "claim" }));
  expect(claim).toHaveBeenCalledWith("own-ticket");
});

it("keeps the assignment read-only for a client or a worker with read permission only", () => {
  render(
    <SupportAssignmentPanel
      staff
      ticket={{ id: "ticket", ownerId: 1, status: "OPEN" }}
      model={{
        actorId: 2,
        canManage: false,
        staffMembers: [],
        busy: false,
        run: async () => {},
        operations: { claim: vi.fn(), assign: vi.fn() },
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: "claim" })).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
});
