import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient, shouldUseSupabase } from "@/server/supabase-server";

async function getWebhookUrl(): Promise<string | null> {
  try {
    if (hasDatabaseUrl()) {
      const { rows } = await getPgPool().query<{ value: string }>(
        "select value from system_rules where key = 'discord_webhook_url'",
      );
      return rows[0]?.value || null;
    }
    if (shouldUseSupabase()) {
      const { data } = await createSupabaseServerClient()
        .from("system_rules")
        .select("value")
        .eq("key", "discord_webhook_url");
      const val = (data?.[0] as { value: string } | undefined)?.value;
      return val || null;
    }
  } catch {
    // webhook URL 取得失敗は無視
  }
  return null;
}

const eventEmoji: Record<string, string> = {
  clockin:        "🟢",
  clockout:       "🔴",
  overtime_start: "⏰",
  break_start:    "☕",
  break_end:      "🔙",
  outing_start:   "🚶",
  outing_return:  "🏃",
};

const eventLabel: Record<string, string> = {
  clockin:        "出勤",
  clockout:       "退勤",
  overtime_start: "残業開始",
  break_start:    "休憩開始",
  break_end:      "休憩終了",
  outing_start:   "外出",
  outing_return:  "外出戻り",
};

export async function notifyDiscord(
  userName: string,
  eventType: string,
  time: string,
  workDate: string,
): Promise<void> {
  const url = await getWebhookUrl();
  if (!url) return;

  const emoji = eventEmoji[eventType] ?? "📋";
  const label = eventLabel[eventType] ?? eventType;
  const content = `${emoji} **${userName}** が ${label} しました　\`${time}\`　（${workDate}）`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {
    // 通知失敗は無視（打刻処理には影響させない）
  }
}
