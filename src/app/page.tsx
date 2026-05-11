import { AttendanceClient } from "@/components/attendance-client";
import { listAttendanceRecords } from "@/server/attendance-service";
import type { AttendanceRecord } from "@/types/attendance";

async function getInitialRecords(): Promise<AttendanceRecord[]> {
  const { data } = await listAttendanceRecords(31);
  return data ?? [];
}

export default async function Home() {
  const initialRecords = await getInitialRecords();

  return (
    <main className="container">
      <AttendanceClient initialRecords={initialRecords} />
    </main>
  );
}
