import { AdminClient } from "@/components/admin-client";
import { listOvertimeRequests } from "@/server/overtime-service";
import { hasDatabaseUrl } from "@/server/pg-client";
import type { OvertimeRequest } from "@/types/overtime";

async function getInitialRequests(): Promise<OvertimeRequest[]> {
  if (!hasDatabaseUrl()) return [];
  const { data } = await listOvertimeRequests();
  return data ?? [];
}

export default async function AdminPage() {
  const initialRequests = await getInitialRequests();
  return (
    <main className="container">
      <AdminClient initialRequests={initialRequests} />
    </main>
  );
}
