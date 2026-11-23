import { expect, it } from "vitest";
import {
  readSupportQueueParams,
  writeSupportQueueParams,
} from "../lib/supportQueueParams";
import {
  supportBackPath,
  supportTicketPath,
} from "@/shared/lib/routes/support";

it("bounds queue URL input and rejects unsupported status and assignee values", () => {
  expect(
    readSupportQueueParams(
      new URLSearchParams({
        page: "-1",
        status: "INVALID",
        assignee: "-12",
        unread: "false",
        q: "a".repeat(200),
      }),
    ),
  ).toMatchObject({
    page: 1,
    status: "",
    assignee: "all",
    unread: false,
    q: "a".repeat(160),
  });
  expect(readSupportQueueParams(new URLSearchParams("page=1000000")).page).toBe(
    100000,
  );
  expect(
    readSupportQueueParams(new URLSearchParams("page=Infinity")).page,
  ).toBe(1);
});
it("replaces only queue filters, retaining the inbox view and selected ticket", () => {
  const result = writeSupportQueueParams(
    new URLSearchParams("view=inbox&ticket=one&q=old&page=3"),
    { status: "OPEN", page: 1, unread: true },
  );
  expect(Object.fromEntries(result)).toEqual({
    view: "inbox",
    ticket: "one",
    status: "OPEN",
    unread: "true",
  });
});
it("limits back links to the correct queue and encodes ticket IDs as one path segment", () => {
  expect(supportBackPath("/admin/support?page=2", true)).toBe(
    "/admin/support?page=2",
  );
  for (const path of [
    "https://example.com",
    "//example.com",
    "/services",
    "/support/tickets/other",
    "/admin/support",
    null,
  ])
    expect(supportBackPath(path)).toBe("/support");
  expect(supportTicketPath("a/b?c")).toBe("/support/tickets/a%2Fb%3Fc");
});
