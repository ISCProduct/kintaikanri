import { NextResponse } from "next/server";
import { getSystemRules, updateSystemRule } from "@/server/rules-service";

export async function GET() {
  try {
    const rules = await getSystemRules();
    return NextResponse.json({ rules });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { key, value } = (await request.json()) as { key?: string; value?: string };
    if (!key || value === undefined) {
      return NextResponse.json({ message: "key と value は必須です。" }, { status: 400 });
    }
    await updateSystemRule(key, value);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
