import { CorrectionClient } from "@/components/correction-client";
import { listCorrectionRequests } from "@/server/correction-service";
import { hasDatabaseUrl } from "@/server/pg-client";
import { shouldUseSupabase } from "@/server/supabase-server";

export default async function CorrectionPage() {
  const canUseDb = hasDatabaseUrl() || shouldUseSupabase();
  const initialRequests = canUseDb ? (await listCorrectionRequests()).data : [];
  return (
    <main className="container">
      <CorrectionClient initialRequests={initialRequests} />
    </main>
  );
}
