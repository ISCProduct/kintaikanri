import { NextResponse } from "next/server";
import {
  listOvertimeRequests,
  createOvertimeRequest,
} from "@/server/overtime-service";
import { revalidateTag } from "next/cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userName = searchParams.get("userName") ?? undefined;

  try {
    const { data } = await listOvertimeRequests(userName);
    return NextResponse.json({ requests: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

type CreatePayload = {
  userName?: string;
  requestDate?: string;
  plannedStart?: string;
  plannedEnd?: string;
  reason?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreatePayload;
    const { userName, requestDate, plannedStart, plannedEnd, reason } = body;

    if (!userName || !requestDate || !plannedStart || !plannedEnd || !reason) {
      return NextResponse.json(
        { message: "すべての項目を入力してください。" },
        { status: 400 },
      );
    }

    if (plannedStart === plannedEnd) {
      return NextResponse.json(
        { message: "終了予定は開始予定と異なる時刻を指定してください。" },
        { status: 400 },
      );
    }

    const { data } = await createOvertimeRequest({
      userName,
      requestDate,
      plannedStart,
      plannedEnd,
      reason,
    });

    revalidateTag("overtime-requests", "max");
    return NextResponse.json({ request: data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
