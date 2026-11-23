import type { useSupportCenter } from "../hooks/useSupportCenter";

export type SupportCenterModel = ReturnType<typeof useSupportCenter>;
export type SupportLayout = "list" | "inbox";
