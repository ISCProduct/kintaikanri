import { AdminSettingsClient } from "@/components/admin-settings-client";
import { getSystemRules, getPaidLeaveSummaries } from "@/server/rules-service";
import { hasDatabaseUrl } from "@/server/pg-client";
import { shouldUseSupabase } from "@/server/supabase-server";

export default async function AdminSettingsPage() {
  const canUseDb = hasDatabaseUrl() || shouldUseSupabase();

  const [rules, summaries] = canUseDb
    ? await Promise.all([getSystemRules(), getPaidLeaveSummaries()])
    : [[], []];

  return (
    <main className="container">
      <AdminSettingsClient initialRules={rules} initialSummaries={summaries} />
    </main>
  );
}
