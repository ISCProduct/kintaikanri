import { NextResponse } from "next/server";
import { approveCorrectionRequest, deleteCorrectionRequest } from "@/server/correction-service";
import type { CorrectionStatus } from "@/types/correction";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { status, approverName, approverComment } =
      (await request.json()) as { status?: CorrectionStatus; approverName?: string; approverComment?: string };
    if (!status || !approverName) {
      return NextResponse.json({ message: "status と approverName は必須です。" }, { status: 400 });
    }
    const { data, error } = await approveCorrectionRequest(id, status, approverName, approverComment);
    if (error) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ request: data });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { error } = await deleteCorrectionRequest(id);
    if (error) return NextResponse.json({ message: error.message }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
