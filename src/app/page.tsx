import { createClient } from "@supabase/supabase-js";
import { AttendanceClient } from "@/components/attendance-client";
import { isSupabaseConfigured } from "@/server/supabase-server";
import type { AttendanceRecord } from "@/types/attendance";
import type { Database } from "@/types/database";

function createSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}

async function getInitialRecords(): Promise<AttendanceRecord[]> {
  const client = createSupabaseClient();

  if (!client) {
    return [];
  }

  const { data, error } = await client
    .from("attendance_records")
    .select("*")
    .order("work_date", { ascending: false })
    .limit(31);

  if (error || !data) {
    return [];
  }

  return data as AttendanceRecord[];
}

export default async function Home() {
  const initialRecords = await getInitialRecords();

  return (
    <main className="container">
      <AttendanceClient initialRecords={initialRecords} />
    </main>
  );
}
