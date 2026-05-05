import { NextResponse } from "next/server";
import { listCorrectionRequests, createCorrectionRequest } from "@/server/correction-service";
import { isMonthClosed } from "@/server/closing-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userName = searchParams.get("userName") ?? undefined;
  try {
    const { data } = await listCorrectionRequests(userName);
    return NextResponse.json({ requests: data });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, string>;
    const { userName, targetDate, afterStart, reason, beforeStart, beforeEnd, afterEnd } = body;
    if (!userName || !targetDate || !afterStart || !reason) {
      return NextResponse.json({ message: "必須項目が不足しています。" }, { status: 400 });
    }
    const month = targetDate.slice(0, 7);
    if (await isMonthClosed(month)) {
      return NextResponse.json({ message: `${month} は締め済みのため修正申請できません。` }, { status: 403 });
    }
    const { data } = await createCorrectionRequest({ userName, targetDate, beforeStart, beforeEnd, afterStart, afterEnd, reason });
    return NextResponse.json({ request: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
