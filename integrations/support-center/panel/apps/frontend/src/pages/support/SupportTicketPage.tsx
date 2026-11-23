import { SupportCenterScreen } from "@/features/support-center/components/layout/SupportCenterScreen";

export function SupportTicketPage({ staff = false }: { staff?: boolean }) {
  return <SupportCenterScreen staff={staff} detail />;
}
