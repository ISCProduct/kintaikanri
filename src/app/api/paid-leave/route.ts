import { NextResponse } from "next/server";
import {
  getMonthlyOvertimeSummary,
  getPaidLeaveSummaries,
  grantPaidLeave,
  getGrantDays,
} from "@/server/rules-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");

  try {
    const [summaries, overtime] = await Promise.all([
      getPaidLeaveSummaries(),
      month ? getMonthlyOvertimeSummary(month) : Promise.resolve([]),
    ]);
    return NextResponse.json({ summaries, overtime });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userName, month } = (await request.json()) as { userName?: string; month?: string };
    if (!userName || !month) {
      return NextResponse.json({ message: "userName と month は必須です。" }, { status: 400 });
    }
    const grantDays = await getGrantDays();
    const reason = `${month} 月次残業超過による自動付与`;
    await grantPaidLeave(userName, month, grantDays, reason);
    return NextResponse.json({ ok: true, grantDays });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
