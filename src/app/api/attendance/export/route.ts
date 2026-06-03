import { NextResponse } from "next/server";
import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient, shouldUseSupabase } from "@/server/supabase-server";
import type { AttendanceRecord, AttendanceEvent } from "@/types/attendance";
import { listAttendanceEventsByMonth } from "@/server/attendance-events-service";

const STANDARD_WORK_MINUTES = 8 * 60;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}:00` : `${h}:${String(m).padStart(2, "0")}`;
}

function calcBreakMinutes(events: AttendanceEvent[]): number {
  let total = 0;
  let start: string | null = null;
  for (const evt of events) {
    if (evt.event_type === "break_start") {
      start = evt.event_time.slice(0, 5);
    } else if (evt.event_type === "break_end" && start) {
      total += Math.max(0, timeToMinutes(evt.event_time.slice(0, 5)) - timeToMinutes(start));
      start = null;
    }
  }
  return total;
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
  let eventsByDate: Record<string, AttendanceEvent[]> = {};

  try {
    if (hasDatabaseUrl()) {
      const where = userName ? "and user_name = $2" : "";
      const { rows } = await getPgPool().query<AttendanceRecord>(
        `select id, user_name, work_date::text, start_time::text, end_time::text, status, note, created_at::text
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

    // 休憩イベントを取得（ユーザー指定がある場合のみ）
    if (userName) {
      const events = await listAttendanceEventsByMonth(userName, month);
      for (const evt of events) {
        (eventsByDate[evt.work_date] ??= []).push(evt);
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }

  // CSVを生成
  const header = ["氏名", "勤務日", "出勤時刻", "退勤時刻", "休憩時間", "勤務時間", "残業時間", "区分", "備考"];
  const rows = records.map((r) => {
    const breakMin = calcBreakMinutes(eventsByDate[r.work_date] ?? []);
    let workMin = 0;
    let overtimeMin = 0;
    if (r.end_time) {
      const gross = Math.max(0, timeToMinutes(r.end_time) - timeToMinutes(r.start_time));
      workMin = Math.max(0, gross - breakMin);
      overtimeMin = Math.max(0, workMin - STANDARD_WORK_MINUTES);
    }
    return [
      r.user_name,
      r.work_date,
      r.start_time,
      r.end_time ?? "",
      breakMin > 0 ? formatMinutes(breakMin) : "",
      r.end_time ? formatMinutes(workMin) : "",
      r.end_time ? formatMinutes(overtimeMin) : "",
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
