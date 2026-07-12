import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient } from "@/server/supabase-server";
import type { SystemRule, PaidLeaveBalance, PaidLeaveSummary, MonthlyOvertimeSummary } from "@/types/rules";
import type { AttendanceEvent } from "@/types/attendance";
import { cacheLife, cacheTag } from "next/cache";
import { calcWork } from "@/lib/attendance-calc";
import { monthDateBounds } from "@/lib/month-range";
import { listAttendanceEventsByMonth } from "@/server/attendance-events-service";

// ── システムルール ──────────────────────────────────────────────────────

export async function getSystemRules(): Promise<SystemRule[]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 180 });
  cacheTag("system-rules");
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<SystemRule>(
      "select key, value, label, updated_at::text from system_rules order by key",
    );
    return rows;
  }
  const { data } = await createSupabaseServerClient()
    .from("system_rules")
    .select("*")
    .order("key");
  return (data ?? []) as SystemRule[];
}

export async function updateSystemRule(key: string, value: string): Promise<void> {
  if (hasDatabaseUrl()) {
    await getPgPool().query(
      "update system_rules set value = $1, updated_at = now() where key = $2",
      [value, key],
    );
    return;
  }
  await createSupabaseServerClient()
    .from("system_rules")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("key", key);
}

async function getRuleValue(key: string, defaultValue: string): Promise<string> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<{ value: string }>(
      "select value from system_rules where key = $1",
      [key],
    );
    return rows[0]?.value ?? defaultValue;
  }
  const { data, error } = await createSupabaseServerClient()
    .from("system_rules")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) return defaultValue;
  return (data as { value: string } | null)?.value ?? defaultValue;
}

// ── 有給残日数 ──────────────────────────────────────────────────────────

export async function getPaidLeaveSummaries(): Promise<PaidLeaveSummary[]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 180 });
  cacheTag("paid-leave");
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<PaidLeaveSummary>(`
      select user_name,
             coalesce(sum(granted_days), 0) as total_granted,
             coalesce(sum(used_days), 0)    as total_used,
             coalesce(sum(granted_days), 0) - coalesce(sum(used_days), 0) as remaining
      from paid_leave_balances
      group by user_name
      order by user_name
    `);
    return rows;
  }
  const { data } = await createSupabaseServerClient()
    .from("paid_leave_balances")
    .select("user_name, granted_days, used_days");
  const map: Record<string, PaidLeaveSummary> = {};
  for (const row of (data ?? []) as PaidLeaveBalance[]) {
    if (!map[row.user_name]) {
      map[row.user_name] = { user_name: row.user_name, total_granted: 0, total_used: 0, remaining: 0 };
    }
    map[row.user_name].total_granted += Number(row.granted_days);
    map[row.user_name].total_used += Number(row.used_days);
    map[row.user_name].remaining += Number(row.granted_days) - Number(row.used_days);
  }
  return Object.values(map).sort((a, b) => a.user_name.localeCompare(b.user_name, "ja"));
}

export async function getPaidLeaveHistory(userName?: string): Promise<PaidLeaveBalance[]> {
  if (hasDatabaseUrl()) {
    const where = userName ? "where user_name = $1" : "";
    const { rows } = await getPgPool().query<PaidLeaveBalance>(
      `select id, user_name, granted_days, used_days, reason, target_month, created_at::text
       from paid_leave_balances ${where} order by created_at desc`,
      userName ? [userName] : [],
    );
    return rows;
  }
  let query = createSupabaseServerClient()
    .from("paid_leave_balances")
    .select("*")
    .order("created_at", { ascending: false });
  if (userName) query = query.eq("user_name", userName);
  const { data } = await query;
  return (data ?? []) as PaidLeaveBalance[];
}

// ── 月次残業集計 ────────────────────────────────────────────────────────

export async function getMonthlyOvertimeSummary(month: string): Promise<MonthlyOvertimeSummary[]> {
  // 管理画面の「集計する」は都度最新データを見る（キャッシュすると障害時の空結果が残る）
  const thresholdHours = parseFloat(await getRuleValue("overtime_threshold_hours", "30"));
  const thresholdMinutes = thresholdHours * 60;

  type Row = {
    user_name: string;
    start_time: string;
    end_time: string | null;
    overtime_start: string | null;
    work_date: string;
  };

  let records: Row[] = [];
  let grantedUsers = new Set<string>();

  if (hasDatabaseUrl()) {
    const [{ rows }, leaveRows] = await Promise.all([
      getPgPool().query<Row>(
        `select user_name, start_time::text, end_time::text, overtime_start::text, work_date::text
         from attendance_records
         where to_char(work_date, 'YYYY-MM') = $1
           and status in ('present', 'remote')
           and end_time is not null`,
        [month],
      ),
      getPgPool().query<{ user_name: string }>(
        `select distinct user_name from paid_leave_balances
         where target_month = $1 and granted_days > 0`,
        [month],
      ),
    ]);
    records = rows;
    grantedUsers = new Set(leaveRows.rows.map((r) => r.user_name));
  } else {
    const supabase = createSupabaseServerClient();
    const { start, end } = monthDateBounds(month);
    const [{ data: leaveData, error: leaveError }, { data: attendanceData, error: attendanceError }] =
      await Promise.all([
        supabase
          .from("paid_leave_balances")
          .select("user_name")
          .eq("target_month", month)
          .gt("granted_days", 0),
        supabase
          .from("attendance_records")
          .select("user_name, start_time, end_time, overtime_start, work_date")
          .gte("work_date", start)
          .lte("work_date", end)
          .in("status", ["present", "remote"]),
      ]);
    if (attendanceError) {
      throw new Error(`勤怠データの取得に失敗しました: ${attendanceError.message}`);
    }
    if (leaveError) {
      throw new Error(`有給データの取得に失敗しました: ${leaveError.message}`);
    }
    grantedUsers = new Set((leaveData ?? []).map((r: { user_name: string }) => r.user_name));
    records = ((attendanceData ?? []) as Row[]).map((r) => ({
      ...r,
      // Supabase の date/time 型を HH:MM / YYYY-MM-DD に正規化
      work_date: String(r.work_date).slice(0, 10),
      start_time: String(r.start_time).slice(0, 5),
      end_time: r.end_time ? String(r.end_time).slice(0, 5) : null,
      overtime_start: r.overtime_start ? String(r.overtime_start).slice(0, 5) : null,
    }));
  }

  const names = Array.from(new Set(records.map((r) => r.user_name)));
  const eventsByKey: Record<string, AttendanceEvent[]> = {};
  await Promise.all(
    names.map(async (name) => {
      try {
        const events = await listAttendanceEventsByMonth(name, month);
        for (const evt of events) {
          const date = String(evt.work_date).slice(0, 10);
          (eventsByKey[`${evt.user_name}|${date}`] ??= []).push({
            ...evt,
            work_date: date,
            event_time: String(evt.event_time).slice(0, 5),
          });
        }
      } catch {
        // イベント取得失敗でも勤務時間集計は続行
      }
    }),
  );

  const userMap: Record<string, { work: number; overtime: number }> = {};
  for (const r of records) {
    if (!r.end_time) continue;
    const dayEvents = eventsByKey[`${r.user_name}|${r.work_date}`] ?? [];
    const { work, overtime } = calcWork(r.start_time, r.end_time, dayEvents, r.overtime_start);
    if (work <= 0 && overtime <= 0) continue;
    if (!userMap[r.user_name]) userMap[r.user_name] = { work: 0, overtime: 0 };
    userMap[r.user_name].work += work;
    userMap[r.user_name].overtime += overtime;
  }

  return Object.entries(userMap)
    .map(([user_name, { work, overtime }]) => ({
      user_name,
      month,
      total_work_minutes: work,
      overtime_minutes: overtime,
      overtime_hours: Math.round((overtime / 60) * 10) / 10,
      exceeds_threshold: overtime >= thresholdMinutes,
      already_granted: grantedUsers.has(user_name),
    }))
    .sort((a, b) => b.overtime_hours - a.overtime_hours);
}

// ── 有給付与 ────────────────────────────────────────────────────────────

export async function grantPaidLeave(
  userName: string,
  month: string,
  grantDays: number,
  reason: string,
): Promise<void> {
  if (hasDatabaseUrl()) {
    await getPgPool().query(
      `insert into paid_leave_balances (user_name, granted_days, used_days, reason, target_month)
       values ($1, $2, 0, $3, $4)`,
      [userName, grantDays, reason, month],
    );
    return;
  }
  await createSupabaseServerClient()
    .from("paid_leave_balances")
    .insert({ user_name: userName, granted_days: grantDays, used_days: 0, reason, target_month: month });
}

export async function getGrantDays(): Promise<number> {
  return parseFloat(await getRuleValue("overtime_leave_grant_days", "1"));
}

export async function recordVacationUsed(userName: string, workDate: string): Promise<void> {
  const reason = `${workDate} 有給休暇取得`;
  const month = workDate.slice(0, 7);
  if (hasDatabaseUrl()) {
    // 同日に既に記録済みなら重複しない
    const { rows } = await getPgPool().query<{ count: string }>(
      "select count(*)::text from paid_leave_balances where user_name = $1 and reason = $2",
      [userName, reason],
    );
    if (parseInt(rows[0]?.count ?? "0") > 0) return;
    await getPgPool().query(
      `insert into paid_leave_balances (user_name, granted_days, used_days, reason, target_month)
       values ($1, 0, 1, $2, $3)`,
      [userName, reason, month],
    );
    return;
  }
  const { count } = await createSupabaseServerClient()
    .from("paid_leave_balances")
    .select("*", { count: "exact", head: true })
    .eq("user_name", userName)
    .eq("reason", reason);
  if ((count ?? 0) > 0) return;
  await createSupabaseServerClient()
    .from("paid_leave_balances")
    .insert({ user_name: userName, granted_days: 0, used_days: 1, reason, target_month: month });
}

export async function getUserPaidLeaveBalance(userName: string): Promise<PaidLeaveSummary | null> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<PaidLeaveSummary>(`
      select user_name,
             coalesce(sum(granted_days), 0) as total_granted,
             coalesce(sum(used_days), 0)    as total_used,
             coalesce(sum(granted_days), 0) - coalesce(sum(used_days), 0) as remaining
      from paid_leave_balances
      where user_name = $1
      group by user_name
    `, [userName]);
    return rows[0] ?? null;
  }
  const { data } = await createSupabaseServerClient()
    .from("paid_leave_balances")
    .select("user_name, granted_days, used_days")
    .eq("user_name", userName);
  if (!data || data.length === 0) return null;
  const summary: PaidLeaveSummary = { user_name: userName, total_granted: 0, total_used: 0, remaining: 0 };
  for (const row of data as PaidLeaveBalance[]) {
    summary.total_granted += Number(row.granted_days);
    summary.total_used += Number(row.used_days);
    summary.remaining += Number(row.granted_days) - Number(row.used_days);
  }
  return summary;
}
