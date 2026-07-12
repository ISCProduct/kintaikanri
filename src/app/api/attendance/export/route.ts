import { NextResponse } from "next/server";
import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient, shouldUseSupabase } from "@/server/supabase-server";
import type { AttendanceRecord, AttendanceEvent } from "@/types/attendance";
import { listAttendanceEventsByMonth } from "@/server/attendance-events-service";
import { calcWork } from "@/lib/attendance-calc";

function formatMinutes(min: number): string {
  const safe = Math.max(0, Math.round(min));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const STATUS_LABELS: Record<string, string> = {
  present: "出社",
  remote: "リモート",
  vacation: "休暇",
  holiday: "休日",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // YYYY-MM
  const userName = searchParams.get("userName") ?? undefined;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ message: "month パラメータ（YYYY-MM形式）が必要です。" }, { status: 400 });
  }

  let records: AttendanceRecord[];
  const eventsByKey: Record<string, AttendanceEvent[]> = {};

  try {
    if (hasDatabaseUrl()) {
      const where = userName ? "and user_name = $2" : "";
      const { rows } = await getPgPool().query<AttendanceRecord>(
        `select id, user_name, work_date::text, start_time::text, end_time::text,
                overtime_start::text, status, note, created_at::text
         from attendance_records
         where to_char(work_date, 'YYYY-MM') = $1 ${where}
         order by user_name, work_date`,
        userName ? [month, userName] : [month],
      );
      records = rows;
    } else if (shouldUseSupabase()) {
      let query = createSupabaseServerClient()
        .from("attendance_records")
        .select("*")
        .like("work_date", `${month}%`)
        .order("user_name")
        .order("work_date");
      if (userName) query = query.eq("user_name", userName);
      const { data } = await query;
      records = (data ?? []) as AttendanceRecord[];
    } else {
      return NextResponse.json({ message: "DB未接続のためエクスポートできません。" }, { status: 503 });
    }

    const names = userName
      ? [userName]
      : Array.from(new Set(records.map((r) => r.user_name)));
    await Promise.all(
      names.map(async (name) => {
        const events = await listAttendanceEventsByMonth(name, month);
        for (const evt of events) {
          (eventsByKey[`${evt.user_name}|${evt.work_date}`] ??= []).push(evt);
        }
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }

  const header = ["氏名", "勤務日", "出勤時刻", "退勤時刻", "残業開始", "休憩・外出", "勤務時間", "残業時間", "区分", "備考"];
  const rows = records.map((r) => {
    const dayEvents = eventsByKey[`${r.user_name}|${r.work_date}`] ?? [];
    const { work, overtime, breakMinutes } = calcWork(
      r.start_time,
      r.end_time,
      dayEvents,
      r.overtime_start,
    );
    return [
      r.user_name,
      r.work_date,
      r.start_time,
      r.end_time ?? "",
      r.overtime_start ?? "",
      breakMinutes > 0 ? formatMinutes(breakMinutes) : "",
      r.end_time ? formatMinutes(work) : "",
      r.end_time ? formatMinutes(overtime) : "",
      STATUS_LABELS[r.status] ?? r.status,
      r.note ?? "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });

  const bom = "﻿"; // Excel対応BOM
  const csv = bom + [header.join(","), ...rows].join("\r\n");
  const filename = `勤怠_${month}${userName ? `_${userName}` : ""}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
