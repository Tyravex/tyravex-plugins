import type { RouteObject } from "react-router-dom";
import { adminRoute } from "../routeFactory";
import { SupportCenterPage } from "@/pages/support/SupportCenterPage";
import { SupportTicketPage } from "@/pages/support/SupportTicketPage";

export const supportRoutes: RouteObject[] = [
  { path: "/support", element: <SupportCenterPage /> },
  { path: "/support/tickets/:ticketId", element: <SupportTicketPage /> },
  adminRoute("/admin/support", "support:read", <SupportCenterPage staff />),
  adminRoute(
    "/admin/support/tickets/:ticketId",
    "support:read",
    <SupportTicketPage staff />,
  ),
  adminRoute(
    "/admin/plugins/local/support-center/preview",
    "plugin:read",
    <SupportCenterPage preview />,
  ),
];
