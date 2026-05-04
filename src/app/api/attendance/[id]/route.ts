import { NextResponse } from "next/server";
import type { AttendanceStatus } from "@/types/attendance";
import {
  deleteAttendanceRecord,
  getAttendanceRecordById,
  updateAttendanceRecord,
  type AttendanceUpdateInput,
} from "@/server/attendance-service";
import { isSupabaseConfigurationError } from "@/server/supabase-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;

  try {
    const { data, error } = await getAttendanceRecordById(id);

    if (error) {
      return NextResponse.json(
        { message: `データ取得に失敗しました: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ record: data });
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

type UpdateAttendancePayload = {
  workDate?: string;
  startTime?: string;
  endTime?: string | null;
  status?: AttendanceStatus;
  note?: string | null;
};

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;

  try {
    const payload = (await request.json()) as UpdateAttendancePayload;
    const input: AttendanceUpdateInput = {
      workDate: payload.workDate,
      startTime: payload.startTime,
      endTime: payload.endTime,
      status: payload.status,
      note: payload.note,
    };

    if (
      input.workDate === undefined &&
      input.startTime === undefined &&
      input.endTime === undefined &&
      input.status === undefined &&
      input.note === undefined
    ) {
      return NextResponse.json(
        { message: "更新する項目を1つ以上指定してください。" },
        { status: 400 },
      );
    }

    const { data, error } = await updateAttendanceRecord(id, input);

    if (error) {
      return NextResponse.json(
        { message: `更新に失敗しました: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ record: data });
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

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;

  try {
    const { error } = await deleteAttendanceRecord(id);

    if (error) {
      return NextResponse.json(
        { message: `削除に失敗しました: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ message: "削除しました。" });
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
