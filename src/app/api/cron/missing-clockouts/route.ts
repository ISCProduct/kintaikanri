import { NextResponse } from "next/server";
import { listMissingClockOuts } from "@/server/attendance-service";
import { sendDiscordMessage } from "@/server/discord-service";
import { writeAuditLog } from "@/server/audit-service";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // ローカル検証用: CRON_SECRET 未設定なら許可
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const records = await listMissingClockOuts();
    if (records.length === 0) {
      return NextResponse.json({ ok: true, count: 0, notified: false });
    }

    const lines = records
      .slice(0, 20)
      .map((r) => `・${r.user_name}（${r.work_date} 出勤 ${String(r.start_time).slice(0, 5)}）`);
    const more = records.length > 20 ? `\n…他 ${records.length - 20} 件` : "";
    const content =
      `⚠️ **退勤打刻漏れアラート**（${records.length}件）\n` +
      lines.join("\n") +
      more +
      `\n管理画面で確認・本人へ修正依頼してください。`;

    const notified = await sendDiscordMessage(content);
    await writeAuditLog({
      actorName: "cron",
      action: "alert.missing_clockout",
      entityType: "attendance",
      detail: { count: records.length, notified },
    });

    return NextResponse.json({ ok: true, count: records.length, notified });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
