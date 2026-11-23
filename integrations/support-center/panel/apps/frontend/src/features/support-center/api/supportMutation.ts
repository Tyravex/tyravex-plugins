import type { AxiosResponse } from "axios";
import { api } from "@/shared/api/client";
import { useAuthStore } from "@/app/store/auth.store";

interface PendingMutation {
  key: string;
  expiresAt: number;
  pending?: Promise<AxiosResponse<unknown>>;
}
const requests = new Map<string, PendingMutation>();
let owner = "";

/** Reuse an uncertain request's key on manual retry; never persist message contents in storage. */
export function postSupportMutation<T = unknown>(
  url: string,
  body?: unknown,
): Promise<AxiosResponse<T>> {
  const auth = useAuthStore.getState();
  const identity = `${auth.user?.id}:${auth.sessionVersion}`;
  if (owner !== identity) {
    requests.clear();
    owner = identity;
  }
  for (const [key, request] of requests)
    if (!request.pending && request.expiresAt <= Date.now())
      requests.delete(key);
  const signature = JSON.stringify([identity, url, body]);
  let request = requests.get(signature);
  if (request?.pending) return request.pending as Promise<AxiosResponse<T>>;
  if (!request) {
    if (requests.size >= 50) requests.delete(requests.keys().next().value!);
    request = {
      key: crypto.randomUUID(),
      expiresAt: Date.now() + 60 * 60 * 1000,
    };
    requests.set(signature, request);
  }
  const current = request;
  const pending = api
    .post<T>(url, body, { headers: { "Idempotency-Key": current.key } })
    .then((response) => {
      if (requests.get(signature) === current) requests.delete(signature);
      return response;
    })
    .catch((error) => {
      current.pending = undefined;
      // A network timeout or 5xx may follow a successful commit. Keep the same receipt key.
      if (
        error?.response?.status >= 400 &&
        error.response.status < 500 &&
        requests.get(signature) === current
      )
        requests.delete(signature);
      throw error;
    });
  current.pending = pending;
  return pending;
}
