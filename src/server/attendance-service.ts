import type { AttendanceStatus } from "@/types/attendance";
import type { Database } from "@/types/database";
import {
  createSupabaseServerClient,
  shouldUseSupabase,
} from "@/server/supabase-server";
import {
  createLocalAttendanceRecord,
  deleteLocalAttendanceRecord,
  getLocalAttendanceRecordById,
  listLocalAttendanceRecords,
  updateLocalAttendanceRecord,
} from "@/server/local-attendance-store";

export type AttendanceCreateInput = {
  userName: string;
  workDate: string;
  startTime: string;
  endTime?: string;
  status?: AttendanceStatus;
  note?: string;
};

export type AttendanceUpdateInput = {
  workDate?: string;
  startTime?: string;
  endTime?: string | null;
  status?: AttendanceStatus;
  note?: string | null;
};

type ServiceError = { message: string };

function notFoundError(message: string): ServiceError {
  return { message };
}

export async function listAttendanceRecords(limit = 31) {
  if (!shouldUseSupabase()) {
    return { data: listLocalAttendanceRecords(limit), error: null };
  }

  const supabase = createSupabaseServerClient();
  return supabase
    .from("attendance_records")
    .select("*")
    .order("work_date", { ascending: false })
    .limit(limit);
}

export async function getAttendanceRecordById(id: string) {
  if (!shouldUseSupabase()) {
    const data = getLocalAttendanceRecordById(id);
    if (!data) {
      return { data: null, error: notFoundError("勤怠データが見つかりません。") };
    }

    return { data, error: null };
  }

  const supabase = createSupabaseServerClient();
  return supabase.from("attendance_records").select("*").eq("id", id).single();
}

export async function createAttendanceRecord(input: AttendanceCreateInput) {
  if (!shouldUseSupabase()) {
    return { data: createLocalAttendanceRecord(input), error: null };
  }

  const supabase = createSupabaseServerClient();
  const insertPayload: Database["public"]["Tables"]["attendance_records"]["Insert"] = {
    user_name: input.userName,
    work_date: input.workDate,
    start_time: input.startTime,
    end_time: input.endTime || null,
    status: input.status ?? "present",
    note: input.note || null,
  };

  return supabase
    .from("attendance_records")
    .insert(insertPayload)
    .select("*")
    .single();
}

export async function updateAttendanceRecord(
  id: string,
  input: AttendanceUpdateInput,
) {
  if (!shouldUseSupabase()) {
    const data = updateLocalAttendanceRecord(id, input);
    if (!data) {
      return { data: null, error: notFoundError("勤怠データが見つかりません。") };
    }

    return { data, error: null };
  }

  const supabase = createSupabaseServerClient();
  const updatePayload: Database["public"]["Tables"]["attendance_records"]["Update"] = {};

  if (input.workDate !== undefined) {
    updatePayload.work_date = input.workDate;
  }
  if (input.startTime !== undefined) {
    updatePayload.start_time = input.startTime;
  }
  if (input.endTime !== undefined) {
    updatePayload.end_time = input.endTime;
  }
  if (input.status !== undefined) {
    updatePayload.status = input.status;
  }
  if (input.note !== undefined) {
    updatePayload.note = input.note;
  }

  return supabase
    .from("attendance_records")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();
}

export async function deleteAttendanceRecord(id: string) {
  if (!shouldUseSupabase()) {
    const deleted = deleteLocalAttendanceRecord(id);
    if (!deleted) {
      return { error: notFoundError("勤怠データが見つかりません。") };
    }

    return { error: null };
  }

  const supabase = createSupabaseServerClient();
  return supabase.from("attendance_records").delete().eq("id", id);
}
