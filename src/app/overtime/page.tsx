import { OvertimeClient } from "@/components/overtime-client";
import { listOvertimeRequests } from "@/server/overtime-service";
import { hasDatabaseUrl } from "@/server/pg-client";
import { shouldUseSupabase } from "@/server/supabase-server";
import type { OvertimeRequest } from "@/types/overtime";

async function getInitialRequests(): Promise<OvertimeRequest[]> {
  if (!hasDatabaseUrl() && !shouldUseSupabase()) return [];
  const { data } = await listOvertimeRequests();
  return data ?? [];
}

export const dynamic = "force-dynamic";

export default async function OvertimePage() {
  const initialRequests = await getInitialRequests();
  return (
    <main className="container">
      <OvertimeClient initialRequests={initialRequests} />
    </main>
  );
}
