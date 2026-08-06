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
import { monthDateBounds } from "@/lib/month-range";

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

const JST_OFFSET_MINUTES = 9 * 60;

function getJstDateString(now = new Date()): string {
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const jst = new Date(utcTime + JST_OFFSET_MINUTES * 60 * 1000);
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, "0");
  const d = String(jst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  const { error: upsertError } = await supabase
    .from("attendance_records")
    .upsert(
      { user_name: userName, work_date: workDate, start_time: startTime, status, note },
      { onConflict: "user_name,work_date", ignoreDuplicates: true },
    );
  if (upsertError) return { data: null, error: { message: upsertError.message } };
  const { data: rows, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("user_name", userName)
    .eq("work_date", workDate);
  return { data: (rows?.[0] ?? null) as AttendanceRecord | null, error: error ? { message: error.message } : null };
}

// ── 退勤打刻：既存の未退勤レコードの end_time を更新 ─────────────────────
// workDate に一致する未退勤が無い場合、直近の未退勤（翌日跨ぎ）を探す
export async function clockOut(
  userName: string,
  workDate: string,
  endTime: string,
): Promise<Result<AttendanceRecord>> {
  const notFound = notFoundError("出勤中の記録がありません。先に出勤打刻してください。");

  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    let { rows } = await pool.query<AttendanceRecord>(
      `update attendance_records set end_time = $1
       where user_name = $2 and work_date = $3 and end_time is null
       returning ${SELECT_COLS}`,
      [endTime, userName, workDate],
    );
    if (!rows[0]) {
      ({ rows } = await pool.query<AttendanceRecord>(
        `update attendance_records set end_time = $1
         where id = (
           select id from attendance_records
           where user_name = $2 and end_time is null
             and status in ('present', 'remote')
           order by work_date desc
           limit 1
         )
         returning ${SELECT_COLS}`,
        [endTime, userName],
      ));
    }
    if (!rows[0]) return { data: null, error: notFound };
    return { data: rows[0], error: null };
  }

  if (!shouldUseSupabase()) {
    const result =
      clockOutLocal(userName, workDate, endTime) ??
      (() => {
        const open = listLocalAttendanceRecords(90).find(
          (r) =>
            r.user_name === userName &&
            !r.end_time &&
            ["present", "remote"].includes(r.status),
        );
        return open ? clockOutLocal(userName, open.work_date, endTime) : null;
      })();
    if (!result) return { data: null, error: notFound };
    return { data: result, error: null };
  }

  // Supabase
  const supabase = createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("attendance_records")
    .update({ end_time: endTime })
    .eq("user_name", userName)
    .eq("work_date", workDate)
    .is("end_time", null)
    .select("*");
  if (error) return { data: null, error: { message: error.message } };
  if (rows?.[0]) return { data: rows[0] as AttendanceRecord, error: null };

  const { data: openRows, error: openError } = await supabase
    .from("attendance_records")
    .select("id, work_date")
    .eq("user_name", userName)
    .is("end_time", null)
    .in("status", ["present", "remote"])
    .order("work_date", { ascending: false })
    .limit(1);
  if (openError) return { data: null, error: { message: openError.message } };
  const open = openRows?.[0] as { id: string; work_date: string } | undefined;
  if (!open) return { data: null, error: notFound };

  const { data: updated, error: updError } = await supabase
    .from("attendance_records")
    .update({ end_time: endTime })
    .eq("id", open.id)
    .select("*");
  if (updError) return { data: null, error: { message: updError.message } };
  if (!updated?.[0]) return { data: null, error: notFound };
  return { data: updated[0] as AttendanceRecord, error: null };
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
  const { data: rows, error } = await supabase
    .from("attendance_records")
    .upsert(payload, { onConflict: "user_name,work_date" })
    .select("*");
  return { data: (rows?.[0] ?? null) as AttendanceRecord | null, error: error ? { message: error.message } : null };
}

// ── 以下は従来どおり ──────────────────────────────────────────────────────

export async function listAttendanceRecords(limit = 31, month?: string, userName?: string) {
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    if (month) {
      const whereParts = [`to_char(work_date, 'YYYY-MM') = $1`];
      const values: unknown[] = [month];
      if (userName) { whereParts.push(`user_name = $2`); values.push(userName); }
      const { rows } = await pool.query<AttendanceRecord>(
        `select ${SELECT_COLS} from attendance_records
         where ${whereParts.join(" and ")}
         order by work_date asc`,
        values,
      );
      return { data: rows, error: null };
    }
    const whereParts = userName ? [`user_name = $2`] : [];
    const values: unknown[] = [limit];
    if (userName) values.push(userName);
    const { rows } = await pool.query<AttendanceRecord>(
      `select ${SELECT_COLS} from attendance_records
       ${whereParts.length ? `where ${whereParts.join(" and ")}` : ""}
       order by work_date desc limit $1`,
      values,
    );
    return { data: rows, error: null };
  }

  if (!shouldUseSupabase()) {
    const all = listLocalAttendanceRecords(limit);
    return { data: userName ? all.filter((r) => r.user_name === userName) : all, error: null };
  }

  const supabase = createSupabaseServerClient();
  if (month) {
    const { start, end } = monthDateBounds(month);
    let q = supabase
      .from("attendance_records")
      .select("*")
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date", { ascending: true });
    if (userName) q = q.eq("user_name", userName);
    return q;
  }
  let q = supabase
    .from("attendance_records")
    .select("*")
    .order("work_date", { ascending: false })
    .limit(limit);
  if (userName) q = q.eq("user_name", userName);
  return q;
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

// 残業開始打刻：未退勤レコードの overtime_start を更新（翌日跨ぎ対応）
export async function recordOvertimeStart(
  userName: string,
  workDate: string,
  overtimeStart: string,
): Promise<Result<AttendanceRecord>> {
  const notFound = notFoundError("出勤中のレコードが見つかりません。先に出勤打刻をしてください。");

  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    let { rows } = await pool.query<AttendanceRecord>(
      `update attendance_records set overtime_start = $1
       where user_name = $2 and work_date = $3 and end_time is null
       returning ${SELECT_COLS}`,
      [overtimeStart, userName, workDate],
    );
    if (!rows[0]) {
      ({ rows } = await pool.query<AttendanceRecord>(
        `update attendance_records set overtime_start = $1
         where id = (
           select id from attendance_records
           where user_name = $2 and end_time is null
             and status in ('present', 'remote')
           order by work_date desc
           limit 1
         )
         returning ${SELECT_COLS}`,
        [overtimeStart, userName],
      ));
    }
    if (!rows[0]) return { data: null, error: notFound };
    return { data: rows[0], error: null };
  }
  if (shouldUseSupabase()) {
    const supabase = createSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("attendance_records")
      .update({ overtime_start: overtimeStart })
      .eq("user_name", userName)
      .eq("work_date", workDate)
      .is("end_time", null)
      .select("*");
    if (error) return { data: null, error: { message: error.message } };
    if (rows?.[0]) return { data: rows[0] as AttendanceRecord, error: null };

    const { data: openRows, error: openError } = await supabase
      .from("attendance_records")
      .select("id")
      .eq("user_name", userName)
      .is("end_time", null)
      .in("status", ["present", "remote"])
      .order("work_date", { ascending: false })
      .limit(1);
    if (openError) return { data: null, error: { message: openError.message } };
    const openId = (openRows?.[0] as { id: string } | undefined)?.id;
    if (!openId) return { data: null, error: notFound };

    const { data: updated, error: updError } = await supabase
      .from("attendance_records")
      .update({ overtime_start: overtimeStart })
      .eq("id", openId)
      .select("*");
    if (updError) return { data: null, error: { message: updError.message } };
    if (!updated?.[0]) return { data: null, error: notFound };
    return { data: updated[0] as AttendanceRecord, error: null };
  }
  return { data: null, error: { message: "データベース未設定です。" } };
}

// end_time が NULL で work_date が今日より前のレコード（退勤漏れ）
export async function listMissingClockOuts(userName?: string): Promise<AttendanceRecord[]> {
  const today = getJstDateString();
  if (hasDatabaseUrl()) {
    const where = userName
      ? "where end_time is null and work_date < $1 and user_name = $2 and status in ('present', 'remote')"
      : "where end_time is null and work_date < $1 and status in ('present', 'remote')";
    const { rows } = await getPgPool().query<AttendanceRecord>(
      `select ${SELECT_COLS} from attendance_records ${where} order by work_date desc`,
      userName ? [today, userName] : [today],
    );
    return rows;
  }
  if (shouldUseSupabase()) {
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
  return listLocalAttendanceRecords(90).filter(
    (r) => !r.end_time && r.work_date < today && ["present", "remote"].includes(r.status ?? ""),
  );
}
