import { beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/app/store/auth.store";
import type { User } from "@/entities/User";
import { postSupportMutation } from "../api/supportMutation";

const post = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ api: { post } }));
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState((state) => ({
    user: { id: 7 } as User,
    sessionVersion: state.sessionVersion + 1,
  }));
});
it("deduplicates in-flight clicks and keeps the receipt key after an uncertain network error", async () => {
  let reject!: (reason: unknown) => void;
  post.mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const first = postSupportMutation("/support/tickets", {
    body: "Private draft",
  });
  const second = postSupportMutation("/support/tickets", {
    body: "Private draft",
  });
  expect(second).toBe(first);
  expect(post).toHaveBeenCalledTimes(1);
  const key = post.mock.calls[0][2].headers["Idempotency-Key"];
  reject(Error("Network timeout"));
  await expect(first).rejects.toThrow("Network timeout");
  post.mockResolvedValueOnce({ data: { id: "ticket" } });
  await postSupportMutation("/support/tickets", { body: "Private draft" });
  expect(post.mock.calls[1][2].headers["Idempotency-Key"]).toBe(key);
  post.mockResolvedValueOnce({ data: { id: "another-ticket" } });
  await postSupportMutation("/support/tickets", { body: "Private draft" });
  expect(post.mock.calls[2][2].headers["Idempotency-Key"]).not.toBe(key);
});
it("never reuses another session receipt or a definitively rejected request key", async () => {
  post.mockRejectedValueOnce({ response: { status: 409 } });
  await expect(postSupportMutation("/support/tickets", {})).rejects.toEqual({
    response: { status: 409 },
  });
  const first = post.mock.calls[0][2].headers["Idempotency-Key"];
  post.mockRejectedValueOnce(Error("Disconnected"));
  await expect(postSupportMutation("/support/tickets", {})).rejects.toThrow();
  const second = post.mock.calls[1][2].headers["Idempotency-Key"];
  expect(second).not.toBe(first);
  useAuthStore.getState().logout();
  useAuthStore.setState({ user: { id: 8 } as User });
  post.mockResolvedValueOnce({ data: {} });
  await postSupportMutation("/support/tickets", {});
  expect(post.mock.calls[2][2].headers["Idempotency-Key"]).not.toBe(second);
});
