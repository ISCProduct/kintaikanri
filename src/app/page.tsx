import { Suspense } from "react";
import { AttendanceClient } from "@/components/attendance-client";

export default function Home() {
  return (
    <main className="container">
      <Suspense>
        <AttendanceClient initialRecords={[]} />
      </Suspense>
    </main>
  );
}
