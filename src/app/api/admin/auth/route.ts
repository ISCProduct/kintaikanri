import { NextResponse } from "next/server";
import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient } from "@/server/supabase-server";

async function getAdminPin(): Promise<string> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<{ value: string }>(
      "select value from system_rules where key = 'admin_pin'",
    );
    return rows[0]?.value ?? "0000";
  }
  const { data } = await createSupabaseServerClient()
    .from("system_rules")
    .select("value")
    .eq("key", "admin_pin")
    .single();
  return (data as { value: string } | null)?.value ?? "0000";
}

export async function POST(request: Request) {
  try {
    const { pin } = (await request.json()) as { pin?: string };
    if (!pin) return NextResponse.json({ ok: false, message: "PINを入力してください。" }, { status: 400 });
    const correct = await getAdminPin();
    if (pin !== correct) return NextResponse.json({ ok: false, message: "PINが正しくありません。" }, { status: 401 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
