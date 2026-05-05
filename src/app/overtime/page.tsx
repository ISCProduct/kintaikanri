import { OvertimeClient } from "@/components/overtime-client";
import { listOvertimeRequests } from "@/server/overtime-service";
import { hasDatabaseUrl } from "@/server/pg-client";
import type { OvertimeRequest } from "@/types/overtime";

async function getInitialRequests(): Promise<OvertimeRequest[]> {
  if (!hasDatabaseUrl()) return [];
  const { data } = await listOvertimeRequests();
  return data ?? [];
}

export default async function OvertimePage() {
  const initialRequests = await getInitialRequests();
  return (
    <main className="container">
      <OvertimeClient initialRequests={initialRequests} />
    </main>
  );
}
