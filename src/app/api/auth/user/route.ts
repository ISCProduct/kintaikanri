import { NextResponse } from "next/server";
import { verifyOrRegisterUser, changePassword } from "@/server/user-profile-service";
import { isSupabaseConfigurationError } from "@/server/supabase-server";

type LoginPayload = {
  userName?: string;
  password?: string;
  newPassword?: string;
};

export async function POST(request: Request) {
  try {
    const { userName, password, newPassword } = (await request.json()) as LoginPayload;

    if (!userName || !password) {
      return NextResponse.json({ message: "ユーザー名とパスワードは必須です。" }, { status: 400 });
    }

    if (newPassword) {
      const result = await changePassword(userName, password, newPassword);
      if (!result.ok) {
        return NextResponse.json({ message: result.message }, { status: 401 });
      }
      return NextResponse.json({ ok: true });
    }

    const result = await verifyOrRegisterUser(userName, password);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 401 });
    }
    return NextResponse.json({ ok: true, firstTime: result.firstTime });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      // Supabase未設定時は認証スキップ（開発環境）
      return NextResponse.json({ ok: true, firstTime: false });
    }
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json({ message }, { status: 500 });
  }
}
