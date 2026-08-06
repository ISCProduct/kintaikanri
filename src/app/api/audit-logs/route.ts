import { NextResponse } from "next/server";
import { listAuditLogs } from "@/server/audit-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "100");
  try {
    const logs = await listAuditLogs(Number.isFinite(limit) ? limit : 100);
    return NextResponse.json({ logs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
