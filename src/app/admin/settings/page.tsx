import { Suspense } from "react";
import { AdminSettingsClient } from "@/components/admin-settings-client";
import { getSystemRules, getPaidLeaveSummaries } from "@/server/rules-service";
import { hasDatabaseUrl } from "@/server/pg-client";
import { shouldUseSupabase } from "@/server/supabase-server";

async function AdminSettingsContent() {
  const canUseDb = hasDatabaseUrl() || shouldUseSupabase();
  const [rules, summaries] = canUseDb
    ? await Promise.all([getSystemRules(), getPaidLeaveSummaries()])
    : [[], []];

  return <AdminSettingsClient initialRules={rules} initialSummaries={summaries} />;
}

export default function AdminSettingsPage() {
  return (
    <main className="container">
      <Suspense>
        <AdminSettingsContent />
      </Suspense>
    </main>
  );
}
