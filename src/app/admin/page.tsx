import { Suspense } from "react";
import { AdminClient } from "@/components/admin-client";
import { listOvertimeRequests } from "@/server/overtime-service";
import { listCorrectionRequests } from "@/server/correction-service";
import { listLeaveRequests } from "@/server/leave-service";
import { hasDatabaseUrl } from "@/server/pg-client";
import { shouldUseSupabase } from "@/server/supabase-server";
import type { OvertimeRequest } from "@/types/overtime";
import type { CorrectionRequest } from "@/types/correction";
import type { LeaveRequest } from "@/types/leave";

async function AdminContent() {
  const canUseDb = hasDatabaseUrl() || shouldUseSupabase();
  const [overtimeRequests, correctionRequests, leaveRequests] = canUseDb
    ? await Promise.all([
        listOvertimeRequests().then((r) => (r.data ?? []) as OvertimeRequest[]),
        listCorrectionRequests().then((r) => r.data as CorrectionRequest[]),
        listLeaveRequests().then((r) => r.data as LeaveRequest[]),
      ])
    : [[] as OvertimeRequest[], [] as CorrectionRequest[], [] as LeaveRequest[]];

  return (
    <AdminClient
      initialRequests={overtimeRequests}
      initialCorrectionRequests={correctionRequests}
      initialLeaveRequests={leaveRequests}
    />
  );
}

export default function AdminPage() {
  return (
    <main className="container">
      <Suspense>
        <AdminContent />
      </Suspense>
    </main>
  );
}
