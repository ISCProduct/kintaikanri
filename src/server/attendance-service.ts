import type { AttendanceRecord, AttendanceStatus } from "@/types/attendance";
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
import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";

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

// --- PostgreSQL (Docker) ---

export async function listAttendanceRecords(limit = 31) {
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<AttendanceRecord>(
      `select id, user_name, work_date::text, start_time::text, end_time::text, status, note, created_at::text
       from attendance_records
       order by work_date desc
       limit $1`,
      [limit],
    );
    return { data: rows, error: null };
  }

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
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<AttendanceRecord>(
      `select id, user_name, work_date::text, start_time::text, end_time::text, status, note, created_at::text
       from attendance_records where id = $1`,
      [id],
    );
    if (!rows[0]) {
      return { data: null, error: notFoundError("勤怠データが見つかりません。") };
    }
    return { data: rows[0], error: null };
  }

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
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<AttendanceRecord>(
      `insert into attendance_records (user_name, work_date, start_time, end_time, status, note)
       values ($1, $2, $3, $4, $5, $6)
       returning id, user_name, work_date::text, start_time::text, end_time::text, status, note, created_at::text`,
      [
        input.userName,
        input.workDate,
        input.startTime,
        input.endTime || null,
        input.status ?? "present",
        input.note || null,
      ],
    );
    return { data: rows[0], error: null };
  }

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
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.workDate !== undefined) { sets.push(`work_date = $${idx++}`); values.push(input.workDate); }
    if (input.startTime !== undefined) { sets.push(`start_time = $${idx++}`); values.push(input.startTime); }
    if (input.endTime !== undefined) { sets.push(`end_time = $${idx++}`); values.push(input.endTime); }
    if (input.status !== undefined) { sets.push(`status = $${idx++}`); values.push(input.status); }
    if (input.note !== undefined) { sets.push(`note = $${idx++}`); values.push(input.note); }

    if (sets.length === 0) {
      return getAttendanceRecordById(id);
    }

    values.push(id);
    const { rows } = await pool.query<AttendanceRecord>(
      `update attendance_records set ${sets.join(", ")}
       where id = $${idx}
       returning id, user_name, work_date::text, start_time::text, end_time::text, status, note, created_at::text`,
      values,
    );
    if (!rows[0]) {
      return { data: null, error: notFoundError("勤怠データが見つかりません。") };
    }
    return { data: rows[0], error: null };
  }

  if (!shouldUseSupabase()) {
    const data = updateLocalAttendanceRecord(id, input);
    if (!data) {
      return { data: null, error: notFoundError("勤怠データが見つかりません。") };
    }
    return { data, error: null };
  }

  const supabase = createSupabaseServerClient();
  const updatePayload: Database["public"]["Tables"]["attendance_records"]["Update"] = {};

  if (input.workDate !== undefined) updatePayload.work_date = input.workDate;
  if (input.startTime !== undefined) updatePayload.start_time = input.startTime;
  if (input.endTime !== undefined) updatePayload.end_time = input.endTime;
  if (input.status !== undefined) updatePayload.status = input.status;
  if (input.note !== undefined) updatePayload.note = input.note;

  return supabase
    .from("attendance_records")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();
}

export async function deleteAttendanceRecord(id: string) {
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rowCount } = await pool.query(
      "delete from attendance_records where id = $1",
      [id],
    );
    if (!rowCount) {
      return { error: notFoundError("勤怠データが見つかりません。") };
    }
    return { error: null };
  }

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
