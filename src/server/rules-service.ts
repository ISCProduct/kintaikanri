import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient } from "@/server/supabase-server";
import type { SystemRule, PaidLeaveBalance, PaidLeaveSummary, MonthlyOvertimeSummary } from "@/types/rules";

// ── システムルール ──────────────────────────────────────────────────────

export async function getSystemRules(): Promise<SystemRule[]> {
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
  const { data } = await createSupabaseServerClient()
    .from("system_rules")
    .select("value")
    .eq("key", key)
    .single();
  return (data as { value: string } | null)?.value ?? defaultValue;
}

// ── 有給残日数 ──────────────────────────────────────────────────────────

export async function getPaidLeaveSummaries(): Promise<PaidLeaveSummary[]> {
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

const STANDARD_WORK_MINUTES = 8 * 60; // 所定労働時間 8時間

export async function getMonthlyOvertimeSummary(month: string): Promise<MonthlyOvertimeSummary[]> {
  const thresholdHours = parseFloat(await getRuleValue("overtime_threshold_hours", "30"));
  const thresholdMinutes = thresholdHours * 60;

  // 既にこの月に付与済みのユーザーを取得
  let grantedUsers: Set<string>;
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<{ user_name: string }>(
      "select distinct user_name from paid_leave_balances where target_month = $1 and granted_days > 0",
      [month],
    );
    grantedUsers = new Set(rows.map((r) => r.user_name));
  } else {
    const { data } = await createSupabaseServerClient()
      .from("paid_leave_balances")
      .select("user_name")
      .eq("target_month", month)
      .gt("granted_days", 0);
    grantedUsers = new Set((data ?? []).map((r: { user_name: string }) => r.user_name));
  }

  // 月次勤怠レコードを取得して残業時間を計算
  let records: Array<{ user_name: string; start_time: string; end_time: string | null }>;
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<{ user_name: string; start_time: string; end_time: string | null }>(
      `select user_name, start_time::text, end_time::text
       from attendance_records
       where to_char(work_date, 'YYYY-MM') = $1 and status in ('present', 'remote')`,
      [month],
    );
    records = rows;
  } else {
    const { data } = await createSupabaseServerClient()
      .from("attendance_records")
      .select("user_name, start_time, end_time")
      .like("work_date", `${month}%`)
      .in("status", ["present", "remote"]);
    records = (data ?? []) as typeof records;
  }

  // ユーザーごとに集計
  const userMap: Record<string, { work: number; overtime: number }> = {};
  for (const r of records) {
    if (!r.end_time) continue;
    const [sh, sm] = r.start_time.split(":").map(Number);
    const [eh, em] = r.end_time.split(":").map(Number);
    const workMin = (eh * 60 + em) - (sh * 60 + sm);
    if (workMin <= 0) continue;
    const overtimeMin = Math.max(0, workMin - STANDARD_WORK_MINUTES);
    if (!userMap[r.user_name]) userMap[r.user_name] = { work: 0, overtime: 0 };
    userMap[r.user_name].work += workMin;
    userMap[r.user_name].overtime += overtimeMin;
  }

  return Object.entries(userMap)
    .map(([user_name, { work, overtime }]) => ({
      user_name,
      month,
      total_work_minutes: work,
      overtime_minutes: overtime,
      overtime_hours: Math.round(overtime / 60 * 10) / 10,
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
