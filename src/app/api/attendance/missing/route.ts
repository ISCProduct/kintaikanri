import { NextResponse } from "next/server";
import { listMissingClockOuts } from "@/server/attendance-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userName = searchParams.get("userName") ?? undefined;
  try {
    const records = await listMissingClockOuts(userName);
    return NextResponse.json({ records });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
