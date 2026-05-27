import { Suspense } from "react";
import { CorrectionClient } from "@/components/correction-client";
import { listCorrectionRequests } from "@/server/correction-service";
import { hasDatabaseUrl } from "@/server/pg-client";
import { shouldUseSupabase } from "@/server/supabase-server";

async function CorrectionContent() {
  const canUseDb = hasDatabaseUrl() || shouldUseSupabase();
  const initialRequests = canUseDb ? (await listCorrectionRequests()).data : [];
  return <CorrectionClient initialRequests={initialRequests} />;
}

export default function CorrectionPage() {
  return (
    <main className="container">
      <Suspense>
        <CorrectionContent />
      </Suspense>
    </main>
  );
}
