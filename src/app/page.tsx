export const dynamic = "force-dynamic";

import { AttendanceClient } from "@/components/attendance-client";

export default function Home() {
  return (
    <main className="container">
      <AttendanceClient initialRecords={[]} />
    </main>
  );
}
