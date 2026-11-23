import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useSupportUpdates() {
  const client = useQueryClient();
  useEffect(() => {
    const refresh = (event: Event) => {
      const notification = (event as CustomEvent<{ content?: string }>).detail;
      if (!notification?.content?.startsWith("tyravex:support:v1:")) return;
      for (const key of [
        "support-tickets",
        "support-ticket",
        "support-unread",
        "support-active-access",
      ])
        void client.invalidateQueries({ queryKey: [key] });
    };
    window.addEventListener("tyravex:notification", refresh);
    return () => window.removeEventListener("tyravex:notification", refresh);
  }, [client]);
}
