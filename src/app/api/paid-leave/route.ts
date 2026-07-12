import { NextResponse } from "next/server";
import {
  getMonthlyOvertimeSummary,
  getPaidLeaveSummaries,
  grantPaidLeave,
  getGrantDays,
  getUserPaidLeaveBalance,
} from "@/server/rules-service";
import { revalidateTag } from "next/cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const userName = searchParams.get("userName");

  try {
    // ユーザー個人の残日数取得
    if (userName && !month) {
      const balance = await getUserPaidLeaveBalance(userName);
      return NextResponse.json({ balance });
    }

    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ message: "month は YYYY-MM 形式で指定してください。" }, { status: 400 });
    }

    const [summaries, overtime] = await Promise.all([
      getPaidLeaveSummaries(),
      month ? getMonthlyOvertimeSummary(month) : Promise.resolve([]),
    ]);
    return NextResponse.json(
      { summaries, overtime },
      { headers: { "Cache-Control": "no-store" } },
    );
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
    revalidateTag("paid-leave", "max");
    revalidateTag("monthly-overtime", "max");
    return NextResponse.json({ ok: true, grantDays });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
