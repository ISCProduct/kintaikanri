import { Suspense } from "react";
import { LeaveClient } from "@/components/leave-client";
import { listLeaveRequests } from "@/server/leave-service";
import { hasDatabaseUrl } from "@/server/pg-client";
import { shouldUseSupabase } from "@/server/supabase-server";
import type { LeaveRequest } from "@/types/leave";

async function LeaveContent() {
  if (!hasDatabaseUrl() && !shouldUseSupabase()) {
    return <LeaveClient initialRequests={[]} />;
  }
  const { data } = await listLeaveRequests();
  return <LeaveClient initialRequests={(data ?? []) as LeaveRequest[]} />;
}

export default function LeavePage() {
  return (
    <main className="container">
      <Suspense>
        <LeaveContent />
      </Suspense>
    </main>
  );
}
