import { AdminGate } from "@/components/admin-gate";
import type { ReactNode } from "react";

// 設定ページは管理者PINのみアクセス可能（管理職ユーザーは不可）
export default function AdminSettingsLayout({ children }: { children: ReactNode }) {
  return <AdminGate adminOnly>{children}</AdminGate>;
}
