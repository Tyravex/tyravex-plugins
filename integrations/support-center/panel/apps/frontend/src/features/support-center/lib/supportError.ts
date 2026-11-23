import { getApiErrorMessage } from "@/shared/lib/getApiErrorMessage";
export function supportError(error: unknown) {
  const message = getApiErrorMessage(error);
  return /^(?:SUPPORT|PLUGIN)_[A-Z_]+$/.test(message) ? message : "error";
}
