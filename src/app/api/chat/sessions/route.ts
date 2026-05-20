import { NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";

  if (!BACKEND_URL) {
    return NextResponse.json(
      { sessions: [], message: "BACKEND_URL が未設定のため取得できません。" },
      { status: 503 },
    );
  }

  const url = new URL("/api/chat/sessions", BACKEND_URL);
  if (userId) url.searchParams.set("userId", userId);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        accept: "application/json",
      },
    });
    const body = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { message: body || "バックエンドの取得に失敗しました。" },
        { status: response.status },
      );
    }
    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "通信に失敗しました。" },
      { status: 500 },
    );
  }
}
