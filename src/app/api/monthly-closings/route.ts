import { NextResponse } from "next/server";
import { listMonthlyClosings, closeMonth, reopenMonth } from "@/server/closing-service";

export async function GET() {
  try {
    const closings = await listMonthlyClosings();
    return NextResponse.json({ closings });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { month, closedBy } = (await request.json()) as { month?: string; closedBy?: string };
    if (!month || !closedBy) {
      return NextResponse.json({ message: "month と closedBy は必須です。" }, { status: 400 });
    }
    await closeMonth(month, closedBy);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { month } = (await request.json()) as { month?: string };
    if (!month) return NextResponse.json({ message: "month は必須です。" }, { status: 400 });
    await reopenMonth(month);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
