import type { AttendanceRecord, AttendanceStatus } from "@/types/attendance";
import type { AttendanceCreateInput, AttendanceUpdateInput } from "@/server/attendance-service";

let records: AttendanceRecord[] = [];

function sortRecords(data: AttendanceRecord[]) {
  return [...data].sort((a, b) => b.work_date.localeCompare(a.work_date));
}

export function listLocalAttendanceRecords(limit: number) {
  return sortRecords(records).slice(0, limit);
}

export function getLocalAttendanceRecordById(id: string) {
  return records.find((r) => r.id === id) ?? null;
}

export function clockInLocal(
  userName: string,
  workDate: string,
  startTime: string,
  status: AttendanceStatus = "present",
  note = "",
): AttendanceRecord {
  const existing = records.find((r) => r.user_name === userName && r.work_date === workDate);
  if (existing) return existing;

  const record: AttendanceRecord = {
    id: crypto.randomUUID(),
    user_name: userName,
    work_date: workDate,
    start_time: startTime,
    end_time: null,
    overtime_start: null,
    status,
    note,
    created_at: new Date().toISOString(),
  };
  records = [record, ...records];
  return record;
}

export function clockOutLocal(
  userName: string,
  workDate: string,
  endTime: string,
): AttendanceRecord | null {
  const existing = records.find((r) => r.user_name === userName && r.work_date === workDate);
  if (!existing) return null;

  const updated = { ...existing, end_time: endTime };
  records = records.map((r) => (r.id === existing.id ? updated : r));
  return updated;
}

export function upsertLocalAttendanceRecord(input: AttendanceCreateInput): AttendanceRecord {
  const existing = records.find(
    (r) => r.user_name === input.userName && r.work_date === input.workDate,
  );

  if (existing) {
    const updated: AttendanceRecord = {
      ...existing,
      start_time: input.startTime,
      end_time: input.endTime ?? existing.end_time,
      status: input.status ?? existing.status,
      note: input.note ?? existing.note,
    };
    records = records.map((r) => (r.id === existing.id ? updated : r));
    return updated;
  }

  const record: AttendanceRecord = {
    id: crypto.randomUUID(),
    user_name: input.userName,
    work_date: input.workDate,
    start_time: input.startTime,
    end_time: input.endTime ?? null,
    overtime_start: null,
    status: input.status ?? "present",
    note: input.note ?? null,
    created_at: new Date().toISOString(),
  };
  records = [record, ...records];
  return record;
}

// createLocalAttendanceRecord は upsert へ委譲
export const createLocalAttendanceRecord = upsertLocalAttendanceRecord;

export function updateLocalAttendanceRecord(id: string, input: AttendanceUpdateInput) {
  const current = records.find((r) => r.id === id);
  if (!current) return null;

  const updated: AttendanceRecord = {
    ...current,
    work_date: input.workDate ?? current.work_date,
    start_time: input.startTime ?? current.start_time,
    end_time: input.endTime !== undefined ? input.endTime : current.end_time,
    status: input.status ?? current.status,
    note: input.note !== undefined ? input.note : current.note,
  };
  records = records.map((r) => (r.id === id ? updated : r));
  return updated;
}

export function deleteLocalAttendanceRecord(id: string) {
  const before = records.length;
  records = records.filter((r) => r.id !== id);
  return records.length !== before;
}
