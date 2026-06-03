import { NextResponse } from "next/server";
import type { AttendanceEventType } from "@/types/attendance";
import { createAttendanceEvent, listAttendanceEvents, listAttendanceEventsByMonth } from "@/server/attendance-events-service";
import { isSupabaseConfigurationError } from "@/server/supabase-server";
import { isMonthClosed } from "@/server/closing-service";
import { notifyDiscord } from "@/server/discord-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userName = searchParams.get("userName") ?? "";
  const workDate = searchParams.get("workDate") ?? "";
  const month = searchParams.get("month") ?? "";
  if (!userName || (!workDate && !month)) {
    return NextResponse.json({ events: [] });
  }
  try {
    const events = month
      ? await listAttendanceEventsByMonth(userName, month)
      : await listAttendanceEvents(userName, workDate);
    return NextResponse.json({ events });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json({ events: [] });
    }
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json({ message }, { status: 500 });
  }
}

type EventPayload = {
  userName?: string;
  workDate?: string;
  eventType?: AttendanceEventType;
  eventTime?: string;
};

export async function POST(request: Request) {
  try {
    const { userName, workDate, eventType, eventTime } = (await request.json()) as EventPayload;
    if (!userName || !workDate || !eventType || !eventTime) {
      return NextResponse.json({ message: "必須項目が不足しています。" }, { status: 400 });
    }
    const month = workDate.slice(0, 7);
    if (await isMonthClosed(month)) {
      return NextResponse.json({ message: `${month} は締め済みのため編集できません。` }, { status: 403 });
    }
    const { data, error } = await createAttendanceEvent(userName, workDate, eventType, eventTime);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    void notifyDiscord(userName, eventType, eventTime, workDate);
    return NextResponse.json({ event: data }, { status: 201 });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json(
        { message: "Supabase未設定のためAPIを利用できません。" },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json({ message }, { status: 500 });
  }
}
