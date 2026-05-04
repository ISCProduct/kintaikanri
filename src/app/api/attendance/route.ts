import { NextResponse } from "next/server";
import type { AttendanceStatus } from "@/types/attendance";
import {
  createAttendanceRecord,
  listAttendanceRecords,
  type AttendanceCreateInput,
} from "@/server/attendance-service";
import { isSupabaseConfigurationError } from "@/server/supabase-server";

export async function GET() {
  try {
    const { data, error } = await listAttendanceRecords(31);

    if (error) {
      return NextResponse.json(
        { message: `データ取得に失敗しました: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ records: data });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json(
        { message: "Supabase未設定のためAPIを利用できません。.env.local と Vercel環境変数を設定してください。" },
        { status: 503 },
      );
    }

    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

type CreateAttendancePayload = {
  userName?: string;
  workDate?: string;
  startTime?: string;
  endTime?: string;
  status?: AttendanceStatus;
  note?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CreateAttendancePayload;
    const { userName, workDate, startTime, endTime, status = "present", note = "" } = payload;

    if (!userName) {
      return NextResponse.json(
        { message: "userName は必須です。" },
        { status: 400 },
      );
    }

    if (!workDate || !startTime) {
      return NextResponse.json(
        { message: "workDate と startTime は必須です。" },
        { status: 400 },
      );
    }

    const input: AttendanceCreateInput = {
      userName,
      workDate,
      startTime,
      endTime,
      status,
      note,
    };

    const { data, error } = await createAttendanceRecord(input);

    if (error) {
      return NextResponse.json(
        { message: `保存に失敗しました: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ record: data }, { status: 201 });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json(
        { message: "Supabase未設定のためAPIを利用できません。.env.local と Vercel環境変数を設定してください。" },
        { status: 503 },
      );
    }

    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
