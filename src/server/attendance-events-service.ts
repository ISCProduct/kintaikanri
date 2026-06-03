import type { AttendanceEvent, AttendanceEventType } from "@/types/attendance";
import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient, shouldUseSupabase } from "@/server/supabase-server";

const SELECT_COLS = `id, user_name, work_date::text, event_type, event_time::text, created_at::text`;

const localEvents: AttendanceEvent[] = [];

export async function createAttendanceEvent(
  userName: string,
  workDate: string,
  eventType: AttendanceEventType,
  eventTime: string,
): Promise<{ data: AttendanceEvent | null; error: { message: string } | null }> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<AttendanceEvent>(
      `insert into attendance_events (user_name, work_date, event_type, event_time)
       values ($1, $2, $3, $4)
       returning ${SELECT_COLS}`,
      [userName, workDate, eventType, eventTime],
    );
    return { data: rows[0] ?? null, error: null };
  }
  if (shouldUseSupabase()) {
    const { data: rows, error } = await createSupabaseServerClient()
      .from("attendance_events")
      .insert({ user_name: userName, work_date: workDate, event_type: eventType, event_time: eventTime })
      .select("*");
    if (error) return { data: null, error: { message: error.message } };
    return { data: (rows?.[0] ?? null) as AttendanceEvent | null, error: null };
  }
  const event: AttendanceEvent = {
    id: Math.random().toString(36).slice(2),
    user_name: userName,
    work_date: workDate,
    event_type: eventType,
    event_time: eventTime,
    created_at: new Date().toISOString(),
  };
  localEvents.push(event);
  return { data: event, error: null };
}

export async function listAttendanceEvents(userName: string, workDate: string): Promise<AttendanceEvent[]> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<AttendanceEvent>(
      `select ${SELECT_COLS} from attendance_events
       where user_name = $1 and work_date = $2
       order by event_time asc`,
      [userName, workDate],
    );
    return rows;
  }
  if (shouldUseSupabase()) {
    const { data } = await createSupabaseServerClient()
      .from("attendance_events")
      .select("*")
      .eq("user_name", userName)
      .eq("work_date", workDate)
      .order("event_time", { ascending: true });
    return (data ?? []) as AttendanceEvent[];
  }
  return localEvents.filter((e) => e.user_name === userName && e.work_date === workDate);
}

export async function listAttendanceEventsByMonth(userName: string, month: string): Promise<AttendanceEvent[]> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<AttendanceEvent>(
      `select ${SELECT_COLS} from attendance_events
       where user_name = $1 and to_char(work_date, 'YYYY-MM') = $2
       order by work_date asc, event_time asc`,
      [userName, month],
    );
    return rows;
  }
  if (shouldUseSupabase()) {
    const { data } = await createSupabaseServerClient()
      .from("attendance_events")
      .select("*")
      .eq("user_name", userName)
      .like("work_date", `${month}%`)
      .order("work_date", { ascending: true })
      .order("event_time", { ascending: true });
    return (data ?? []) as AttendanceEvent[];
  }
  return localEvents
    .filter((e) => e.user_name === userName && e.work_date.startsWith(month))
    .sort((a, b) => a.work_date.localeCompare(b.work_date) || a.event_time.localeCompare(b.event_time));
}
