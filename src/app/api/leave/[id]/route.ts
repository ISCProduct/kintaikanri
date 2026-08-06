import { NextResponse } from "next/server";
import {
  getLeaveRequestById,
  approveLeaveRequest,
  deleteLeaveRequest,
} from "@/server/leave-service";
import type { LeaveStatus } from "@/types/leave";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { data, error } = await getLeaveRequestById(id);
    if (error) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ request: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      status?: LeaveStatus;
      approverName?: string;
      approverComment?: string;
    };
    if (!body.status || !body.approverName) {
      return NextResponse.json(
        { message: "status と approverName は必須です。" },
        { status: 400 },
      );
    }
    if (!["approved", "rejected"].includes(body.status)) {
      return NextResponse.json(
        { message: "status は approved または rejected を指定してください。" },
        { status: 400 },
      );
    }
    const { data, error } = await approveLeaveRequest(id, {
      status: body.status,
      approverName: body.approverName,
      approverComment: body.approverComment,
    });
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ request: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { error } = await deleteLeaveRequest(id);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
