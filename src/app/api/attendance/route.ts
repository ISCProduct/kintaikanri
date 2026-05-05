import { NextResponse } from "next/server";
import type { AttendanceStatus } from "@/types/attendance";
import {
  clockIn,
  clockOut,
  upsertAttendanceRecord,
  listAttendanceRecords,
  recordOvertimeStart,
} from "@/server/attendance-service";
import { isSupabaseConfigurationError } from "@/server/supabase-server";
import { recordVacationUsed } from "@/server/rules-service";
import { isMonthClosed } from "@/server/closing-service";

export async function GET() {
  try {
    const { data, error } = await listAttendanceRecords(31);
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    return NextResponse.json({ records: data });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json(
        { message: "Supabase未設定のためAPIを利用できません。" },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

type AttendancePayload = {
  action: "clockin" | "clockout" | "overtime_start" | "manual";
  userName?: string;
  workDate?: string;
  startTime?: string;
  endTime?: string;
  overtimeStart?: string;
  status?: AttendanceStatus;
  note?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AttendancePayload;
    const { action, userName, workDate } = payload;

    if (!userName) {
      return NextResponse.json({ message: "userName は必須です。" }, { status: 400 });
    }
    if (!workDate) {
      return NextResponse.json({ message: "workDate は必須です。" }, { status: 400 });
    }

    const month = workDate.slice(0, 7);
    if (await isMonthClosed(month)) {
      return NextResponse.json({ message: `${month} は締め済みのため編集できません。` }, { status: 403 });
    }

    if (action === "clockin") {
      if (!payload.startTime) {
        return NextResponse.json({ message: "startTime は必須です。" }, { status: 400 });
      }
      const { data, error } = await clockIn(
        userName,
        workDate,
        payload.startTime,
        payload.status,
        payload.note,
      );
      if (error) return NextResponse.json({ message: error.message }, { status: 400 });
      return NextResponse.json({ record: data }, { status: 201 });
    }

    if (action === "clockout") {
      if (!payload.endTime) {
        return NextResponse.json({ message: "endTime は必須です。" }, { status: 400 });
      }
      const { data, error } = await clockOut(userName, workDate, payload.endTime);
      if (error) return NextResponse.json({ message: error.message }, { status: 400 });
      return NextResponse.json({ record: data });
    }

    if (action === "overtime_start") {
      if (!payload.overtimeStart) {
        return NextResponse.json({ message: "overtimeStart は必須です。" }, { status: 400 });
      }
      const { data, error } = await recordOvertimeStart(userName, workDate, payload.overtimeStart);
      if (error) return NextResponse.json({ message: error.message }, { status: 400 });
      return NextResponse.json({ record: data });
    }

    // manual
    if (!payload.startTime) {
      return NextResponse.json({ message: "startTime は必須です。" }, { status: 400 });
    }
    const { data, error } = await upsertAttendanceRecord({
      userName,
      workDate,
      startTime: payload.startTime,
      endTime: payload.endTime,
      status: payload.status,
      note: payload.note,
    });
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    if (payload.status === "vacation") {
      await recordVacationUsed(userName, workDate);
    }
    return NextResponse.json({ record: data }, { status: 201 });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json(
        { message: "Supabase未設定のためAPIを利用できません。" },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
