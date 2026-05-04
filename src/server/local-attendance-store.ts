import type { AttendanceRecord } from "@/types/attendance";
import type { AttendanceCreateInput, AttendanceUpdateInput } from "@/server/attendance-service";

let records: AttendanceRecord[] = [];

function sortRecords(data: AttendanceRecord[]) {
  return [...data].sort((a, b) => b.work_date.localeCompare(a.work_date));
}

export function listLocalAttendanceRecords(limit: number) {
  return sortRecords(records).slice(0, limit);
}

export function getLocalAttendanceRecordById(id: string) {
  return records.find((record) => record.id === id) ?? null;
}

export function createLocalAttendanceRecord(input: AttendanceCreateInput) {
  const record: AttendanceRecord = {
    id: crypto.randomUUID(),
    work_date: input.workDate,
    start_time: input.startTime,
    end_time: input.endTime ?? null,
    status: input.status ?? "present",
    note: input.note ?? null,
    created_at: new Date().toISOString(),
  };

  records = [record, ...records];
  return record;
}

export function updateLocalAttendanceRecord(id: string, input: AttendanceUpdateInput) {
  const current = records.find((record) => record.id === id);
  if (!current) {
    return null;
  }

  const updated: AttendanceRecord = {
    ...current,
    work_date: input.workDate ?? current.work_date,
    start_time: input.startTime ?? current.start_time,
    end_time: input.endTime ?? current.end_time,
    status: input.status ?? current.status,
    note: input.note ?? current.note,
  };

  records = records.map((record) => (record.id === id ? updated : record));
  return updated;
}

export function deleteLocalAttendanceRecord(id: string) {
  const before = records.length;
  records = records.filter((record) => record.id !== id);
  return records.length !== before;
}
