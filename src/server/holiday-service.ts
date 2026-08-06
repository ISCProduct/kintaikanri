import type { Holiday, HolidayKind } from "@/types/holiday";
import { NATIONAL_HOLIDAY_SEED } from "@/types/holiday";
import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient, shouldUseSupabase } from "@/server/supabase-server";

export async function listHolidays(month?: string): Promise<Holiday[]> {
  if (hasDatabaseUrl()) {
    if (month) {
      const { rows } = await getPgPool().query<Holiday>(
        `select holiday_date::text, name, kind, created_at::text
         from holidays
         where to_char(holiday_date, 'YYYY-MM') = $1
         order by holiday_date`,
        [month],
      );
      return rows;
    }
    const { rows } = await getPgPool().query<Holiday>(
      `select holiday_date::text, name, kind, created_at::text from holidays order by holiday_date`,
    );
    return rows;
  }
  if (!shouldUseSupabase()) return [];
  let query = createSupabaseServerClient()
    .from("holidays")
    .select("*")
    .order("holiday_date");
  if (month) {
    const start = `${month}-01`;
    const endDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const end = `${month}-${String(endDay).padStart(2, "0")}`;
    query = query.gte("holiday_date", start).lte("holiday_date", end);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Holiday[]).map((h) => ({
    ...h,
    holiday_date: String(h.holiday_date).slice(0, 10),
  }));
}

export async function upsertHoliday(input: {
  holidayDate: string;
  name: string;
  kind: HolidayKind;
}): Promise<Holiday> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<Holiday>(
      `insert into holidays (holiday_date, name, kind)
       values ($1, $2, $3)
       on conflict (holiday_date) do update set name = excluded.name, kind = excluded.kind
       returning holiday_date::text, name, kind, created_at::text`,
      [input.holidayDate, input.name, input.kind],
    );
    return rows[0];
  }
  if (!shouldUseSupabase()) throw new Error("データベース未設定です。");
  const { data, error } = await createSupabaseServerClient()
    .from("holidays")
    .upsert({
      holiday_date: input.holidayDate,
      name: input.name,
      kind: input.kind,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "祝日の保存に失敗しました。");
  return { ...(data as Holiday), holiday_date: String((data as Holiday).holiday_date).slice(0, 10) };
}

export async function deleteHoliday(holidayDate: string): Promise<void> {
  if (hasDatabaseUrl()) {
    await getPgPool().query("delete from holidays where holiday_date = $1", [holidayDate]);
    return;
  }
  if (!shouldUseSupabase()) throw new Error("データベース未設定です。");
  const { error } = await createSupabaseServerClient()
    .from("holidays")
    .delete()
    .eq("holiday_date", holidayDate);
  if (error) throw new Error(error.message);
}

/** 国民の祝日シードを upsert（会社休日は上書きしない） */
export async function seedNationalHolidays(): Promise<number> {
  let count = 0;
  for (const h of NATIONAL_HOLIDAY_SEED) {
    if (hasDatabaseUrl()) {
      await getPgPool().query(
        `insert into holidays (holiday_date, name, kind)
         values ($1, $2, $3)
         on conflict (holiday_date) do update
           set name = excluded.name
         where holidays.kind = 'national'`,
        [h.holiday_date, h.name, h.kind],
      );
      count += 1;
      continue;
    }
    if (!shouldUseSupabase()) continue;
    const supabase = createSupabaseServerClient();
    const { data: existing } = await supabase
      .from("holidays")
      .select("kind")
      .eq("holiday_date", h.holiday_date)
      .maybeSingle();
    if (existing && (existing as { kind: string }).kind === "company") continue;
    await supabase.from("holidays").upsert({
      holiday_date: h.holiday_date,
      name: h.name,
      kind: h.kind,
    });
    count += 1;
  }
  return count;
}
