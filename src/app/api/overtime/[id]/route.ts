import { NextResponse } from "next/server";
import {
  getOvertimeRequestById,
  approveOvertimeRequest,
  deleteOvertimeRequest,
} from "@/server/overtime-service";
import type { OvertimeStatus } from "@/types/overtime";
import { revalidateTag } from "next/cache";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { data, error } = await getOvertimeRequestById(id);
    if (error) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ request: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

type ApprovePayload = {
  status?: OvertimeStatus;
  approverName?: string;
  approverComment?: string;
};

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = (await request.json()) as ApprovePayload;
    const { status, approverName, approverComment } = body;

    if (!status || !approverName) {
      return NextResponse.json(
        { message: "status と approverName は必須です。" },
        { status: 400 },
      );
    }

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { message: "status は approved または rejected を指定してください。" },
        { status: 400 },
      );
    }

    const { data, error } = await approveOvertimeRequest(id, {
      status,
      approverName,
      approverComment,
    });

    if (error) return NextResponse.json({ message: error.message }, { status: 404 });
    revalidateTag("overtime-requests", "max");
    return NextResponse.json({ request: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { error } = await deleteOvertimeRequest(id);
    if (error) return NextResponse.json({ message: error.message }, { status: 404 });
    revalidateTag("overtime-requests", "max");
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
