import { NextResponse } from "next/server";
import {
  listLeaveRequests,
  createLeaveRequest,
} from "@/server/leave-service";
import type { LeaveType } from "@/types/leave";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userName = searchParams.get("userName") ?? undefined;
  try {
    const { data } = await listLeaveRequests(userName);
    return NextResponse.json({ requests: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userName?: string;
      leaveDate?: string;
      leaveType?: LeaveType;
      reason?: string;
    };
    if (!body.userName || !body.leaveDate || !body.leaveType || !body.reason?.trim()) {
      return NextResponse.json(
        { message: "userName, leaveDate, leaveType, reason は必須です。" },
        { status: 400 },
      );
    }
    if (!["full", "half_am", "half_pm"].includes(body.leaveType)) {
      return NextResponse.json({ message: "leaveType が不正です。" }, { status: 400 });
    }
    const { data, error } = await createLeaveRequest({
      userName: body.userName.trim(),
      leaveDate: body.leaveDate,
      leaveType: body.leaveType,
      reason: body.reason.trim(),
    });
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ request: data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
