export const dynamic = "force-dynamic";

import { AttendanceClient } from "@/components/attendance-client";
import { listAttendanceRecords } from "@/server/attendance-service";
import { isSupabaseConfigurationError } from "@/server/supabase-server";
import type { AttendanceRecord } from "@/types/attendance";

async function getInitialRecords(): Promise<AttendanceRecord[]> {
  try {
    const { data } = await listAttendanceRecords(31);
    return data ?? [];
  } catch (e) {
    if (isSupabaseConfigurationError(e)) return [];
    throw e;
  }
}

export default async function Home() {
  const initialRecords = await getInitialRecords();

  return (
    <main className="container">
      <AttendanceClient initialRecords={initialRecords} />
    </main>
  );
}
