import { NextResponse } from "next/server";
import {
  listHolidays,
  upsertHoliday,
  deleteHoliday,
  seedNationalHolidays,
} from "@/server/holiday-service";
import type { HolidayKind } from "@/types/holiday";
import { writeAuditLog } from "@/server/audit-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? undefined;
  try {
    const holidays = await listHolidays(month);
    return NextResponse.json({ holidays }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "seed" | "upsert";
      holidayDate?: string;
      name?: string;
      kind?: HolidayKind;
      actorName?: string;
    };

    if (body.action === "seed") {
      const count = await seedNationalHolidays();
      await writeAuditLog({
        actorName: body.actorName?.trim() || "system",
        action: "holiday.seed",
        entityType: "holidays",
        detail: { count },
      });
      return NextResponse.json({ ok: true, count });
    }

    if (!body.holidayDate || !body.name?.trim() || !body.kind) {
      return NextResponse.json(
        { message: "holidayDate, name, kind は必須です。" },
        { status: 400 },
      );
    }
    if (!["national", "company"].includes(body.kind)) {
      return NextResponse.json({ message: "kind が不正です。" }, { status: 400 });
    }
    const holiday = await upsertHoliday({
      holidayDate: body.holidayDate,
      name: body.name.trim(),
      kind: body.kind,
    });
    await writeAuditLog({
      actorName: body.actorName?.trim() || "admin",
      action: "holiday.upsert",
      entityType: "holiday",
      entityId: holiday.holiday_date,
      detail: { name: holiday.name, kind: holiday.kind },
    });
    return NextResponse.json({ holiday }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { holidayDate?: string; actorName?: string };
    if (!body.holidayDate) {
      return NextResponse.json({ message: "holidayDate は必須です。" }, { status: 400 });
    }
    await deleteHoliday(body.holidayDate);
    await writeAuditLog({
      actorName: body.actorName?.trim() || "admin",
      action: "holiday.delete",
      entityType: "holiday",
      entityId: body.holidayDate,
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
