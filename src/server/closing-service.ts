import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient, shouldUseSupabase } from "@/server/supabase-server";

export type MonthlyClosing = {
  month: string;
  closed_by: string;
  closed_at: string;
};

export async function listMonthlyClosings(): Promise<MonthlyClosing[]> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<MonthlyClosing>(
      "select month, closed_by, closed_at::text from monthly_closings order by month desc",
    );
    return rows;
  }
  if (shouldUseSupabase()) {
    const { data } = await createSupabaseServerClient()
      .from("monthly_closings")
      .select("*")
      .order("month", { ascending: false });
    return (data ?? []) as MonthlyClosing[];
  }
  return [];
}

export async function isMonthClosed(month: string): Promise<boolean> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<{ count: string }>(
      "select count(*)::text from monthly_closings where month = $1",
      [month],
    );
    return parseInt(rows[0]?.count ?? "0") > 0;
  }
  if (shouldUseSupabase()) {
    const { count } = await createSupabaseServerClient()
      .from("monthly_closings")
      .select("*", { count: "exact", head: true })
      .eq("month", month);
    return (count ?? 0) > 0;
  }
  return false;
}

export async function closeMonth(month: string, closedBy: string): Promise<void> {
  if (hasDatabaseUrl()) {
    await getPgPool().query(
      "insert into monthly_closings (month, closed_by) values ($1, $2) on conflict (month) do nothing",
      [month, closedBy],
    );
    return;
  }
  if (shouldUseSupabase()) {
    await createSupabaseServerClient()
      .from("monthly_closings")
      .upsert({ month, closed_by: closedBy });
  }
}

export async function reopenMonth(month: string): Promise<void> {
  if (hasDatabaseUrl()) {
    await getPgPool().query("delete from monthly_closings where month = $1", [month]);
    return;
  }
  if (shouldUseSupabase()) {
    await createSupabaseServerClient()
      .from("monthly_closings")
      .delete()
      .eq("month", month);
  }
}
