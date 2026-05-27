import { Suspense } from "react";
import { OvertimeClient } from "@/components/overtime-client";
import { listOvertimeRequests } from "@/server/overtime-service";
import { hasDatabaseUrl } from "@/server/pg-client";
import { shouldUseSupabase } from "@/server/supabase-server";
import type { OvertimeRequest } from "@/types/overtime";

async function OvertimeContent() {
  if (!hasDatabaseUrl() && !shouldUseSupabase()) {
    return <OvertimeClient initialRequests={[]} />;
  }
  const { data } = await listOvertimeRequests();
  return <OvertimeClient initialRequests={(data ?? []) as OvertimeRequest[]} />;
}

export default function OvertimePage() {
  return (
    <main className="container">
      <Suspense>
        <OvertimeContent />
      </Suspense>
    </main>
  );
}
