import { SupportCenterScreen } from "@/features/support-center/components/layout/SupportCenterScreen";

export function SupportCenterPage({
  preview = false,
  staff = false,
}: {
  preview?: boolean;
  staff?: boolean;
}) {
  return <SupportCenterScreen preview={preview} staff={staff} />;
}
