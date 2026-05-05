import type { AttendanceRecord, AttendanceStatus } from "@/types/attendance";
import type { Database } from "@/types/database";
import {
  createSupabaseServerClient,
  shouldUseSupabase,
} from "@/server/supabase-server";
import {
  clockInLocal,
  clockOutLocal,
  upsertLocalAttendanceRecord,
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
type Result<T> = { data: T | null; error: ServiceError | null };

const SELECT_COLS = `
  id, user_name, work_date::text, start_time::text, end_time::text,
  overtime_start::text, status, note, created_at::text
`;

function notFoundError(message: string): ServiceError {
  return { message };
}

// ── 出勤打刻：同日レコードが既にあれば何もしない ────────────────────────
export async function clockIn(
  userName: string,
  workDate: string,
  startTime: string,
  status: AttendanceStatus = "present",
  note = "",
): Promise<Result<AttendanceRecord>> {
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    // 既存があれば何もしない（DO NOTHING）。既存レコードを返す。
    await pool.query(
      `insert into attendance_records (user_name, work_date, start_time, status, note)
       values ($1, $2, $3, $4, $5)
       on conflict (user_name, work_date) do nothing`,
      [userName, workDate, startTime, status, note],
    );
    const { rows } = await pool.query<AttendanceRecord>(
      `select ${SELECT_COLS} from attendance_records
       where user_name = $1 and work_date = $2`,
      [userName, workDate],
    );
    return { data: rows[0] ?? null, error: null };
  }

  if (!shouldUseSupabase()) {
    return { data: clockInLocal(userName, workDate, startTime, status, note), error: null };
  }

  // Supabase: upsert で start_time のみセット（既存の start_time は上書きしない）
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("attendance_records")
    .upsert(
      { user_name: userName, work_date: workDate, start_time: startTime, status, note },
      { onConflict: "user_name,work_date", ignoreDuplicates: true },
    )
    .select("*")
    .single();
  return { data: data as AttendanceRecord | null, error: error ? { message: error.message } : null };
}

// ── 退勤打刻：既存レコードの end_time を更新 ─────────────────────────────
export async function clockOut(
  userName: string,
  workDate: string,
  endTime: string,
): Promise<Result<AttendanceRecord>> {
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<AttendanceRecord>(
      `update attendance_records set end_time = $1
       where user_name = $2 and work_date = $3
       returning ${SELECT_COLS}`,
      [endTime, userName, workDate],
    );
    if (!rows[0]) {
      return { data: null, error: notFoundError("本日の出勤記録がありません。先に出勤打刻してください。") };
    }
    return { data: rows[0], error: null };
  }

  if (!shouldUseSupabase()) {
    const result = clockOutLocal(userName, workDate, endTime);
    if (!result) return { data: null, error: notFoundError("本日の出勤記録がありません。先に出勤打刻してください。") };
    return { data: result, error: null };
  }

  // Supabase
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("attendance_records")
    .update({ end_time: endTime })
    .eq("user_name", userName)
    .eq("work_date", workDate)
    .select("*")
    .single();
  return { data: data as AttendanceRecord | null, error: error ? { message: error.message } : null };
}

// ── 手入力フォーム：UPSERT（全フィールド上書き） ─────────────────────────
export async function upsertAttendanceRecord(
  input: AttendanceCreateInput,
): Promise<Result<AttendanceRecord>> {
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<AttendanceRecord>(
      `insert into attendance_records (user_name, work_date, start_time, end_time, status, note)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_name, work_date) do update
         set start_time = excluded.start_time,
             end_time   = excluded.end_time,
             status     = excluded.status,
             note       = excluded.note
       returning ${SELECT_COLS}`,
      [
        input.userName,
        input.workDate,
        input.startTime,
        input.endTime || null,
        input.status ?? "present",
        input.note || null,
      ],
    );
    return { data: rows[0] ?? null, error: null };
  }

  if (!shouldUseSupabase()) {
    return { data: upsertLocalAttendanceRecord(input), error: null };
  }

  const supabase = createSupabaseServerClient();
  const payload: Database["public"]["Tables"]["attendance_records"]["Insert"] = {
    user_name: input.userName,
    work_date: input.workDate,
    start_time: input.startTime,
    end_time: input.endTime || null,
    status: input.status ?? "present",
    note: input.note || null,
  };
  const { data, error } = await supabase
    .from("attendance_records")
    .upsert(payload, { onConflict: "user_name,work_date" })
    .select("*")
    .single();
  return { data: data as AttendanceRecord | null, error: error ? { message: error.message } : null };
}

// ── 以下は従来どおり ──────────────────────────────────────────────────────

export async function listAttendanceRecords(limit = 31) {
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<AttendanceRecord>(
      `select ${SELECT_COLS} from attendance_records
       order by work_date desc limit $1`,
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
      `select ${SELECT_COLS} from attendance_records where id = $1`,
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

export async function updateAttendanceRecord(id: string, input: AttendanceUpdateInput) {
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

    if (sets.length === 0) return getAttendanceRecordById(id);

    values.push(id);
    const { rows } = await pool.query<AttendanceRecord>(
      `update attendance_records set ${sets.join(", ")}
       where id = $${idx}
       returning ${SELECT_COLS}`,
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

// 旧 createAttendanceRecord は upsert へ委譲（後方互換）
export const createAttendanceRecord = upsertAttendanceRecord;

// 残業開始打刻：当日レコードの overtime_start を更新
export async function recordOvertimeStart(
  userName: string,
  workDate: string,
  overtimeStart: string,
): Promise<Result<AttendanceRecord>> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<AttendanceRecord>(
      `update attendance_records set overtime_start = $1
       where user_name = $2 and work_date = $3
       returning ${SELECT_COLS}`,
      [overtimeStart, userName, workDate],
    );
    if (!rows[0]) return { data: null, error: notFoundError("本日の出勤レコードが見つかりません。先に出勤打刻をしてください。") };
    return { data: rows[0], error: null };
  }
  if (shouldUseSupabase()) {
    const { data, error } = await createSupabaseServerClient()
      .from("attendance_records")
      .update({ overtime_start: overtimeStart })
      .eq("user_name", userName)
      .eq("work_date", workDate)
      .select("*")
      .single();
    if (error || !data) return { data: null, error: { message: error?.message ?? "更新に失敗しました。" } };
    return { data: data as AttendanceRecord, error: null };
  }
  return { data: null, error: { message: "データベース未設定です。" } };
}

// end_time が NULL で work_date が今日より前のレコード（退勤漏れ）
export async function listMissingClockOuts(userName?: string): Promise<AttendanceRecord[]> {
  if (hasDatabaseUrl()) {
    const where = userName
      ? "where end_time is null and work_date < current_date and user_name = $1 and status in ('present', 'remote')"
      : "where end_time is null and work_date < current_date and status in ('present', 'remote')";
    const { rows } = await getPgPool().query<AttendanceRecord>(
      `select ${SELECT_COLS} from attendance_records ${where} order by work_date desc`,
      userName ? [userName] : [],
    );
    return rows;
  }
  if (shouldUseSupabase()) {
    const today = new Date().toISOString().slice(0, 10);
    let q = createSupabaseServerClient()
      .from("attendance_records")
      .select("*")
      .is("end_time", null)
      .lt("work_date", today)
      .in("status", ["present", "remote"])
      .order("work_date", { ascending: false });
    if (userName) q = q.eq("user_name", userName);
    const { data } = await q;
    return (data ?? []) as AttendanceRecord[];
  }
  // ローカルストアは簡易対応
  const today = new Date().toISOString().slice(0, 10);
  return listLocalAttendanceRecords(90).filter(
    (r) => !r.end_time && r.work_date < today && ["present", "remote"].includes(r.status ?? ""),
  );
}
