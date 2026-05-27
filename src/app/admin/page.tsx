import { Suspense } from "react";
import { AdminClient } from "@/components/admin-client";
import { listOvertimeRequests } from "@/server/overtime-service";
import { listCorrectionRequests } from "@/server/correction-service";
import { hasDatabaseUrl } from "@/server/pg-client";
import { shouldUseSupabase } from "@/server/supabase-server";
import type { OvertimeRequest } from "@/types/overtime";
import type { CorrectionRequest } from "@/types/correction";

async function AdminContent() {
  const canUseDb = hasDatabaseUrl() || shouldUseSupabase();
  const [overtimeRequests, correctionRequests] = canUseDb
    ? await Promise.all([
        listOvertimeRequests().then((r) => (r.data ?? []) as OvertimeRequest[]),
        listCorrectionRequests().then((r) => r.data as CorrectionRequest[]),
      ])
    : [[] as OvertimeRequest[], [] as CorrectionRequest[]];

  return (
    <AdminClient
      initialRequests={overtimeRequests}
      initialCorrectionRequests={correctionRequests}
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
