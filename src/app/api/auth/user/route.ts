import { NextResponse } from "next/server";
import { verifyUser, changePin } from "@/server/user-profile-service";
import { isSupabaseConfigurationError } from "@/server/supabase-server";

type LoginPayload = {
  userName?: string;
  pin?: string;
  newPin?: string;
};

export async function POST(request: Request) {
  try {
    const { userName, pin, newPin } = (await request.json()) as LoginPayload;

    if (!userName || !pin) {
      return NextResponse.json({ message: "ユーザー名とPINは必須です。" }, { status: 400 });
    }

    if (newPin) {
      const result = await changePin(userName, pin, newPin);
      if (!result.ok) {
        return NextResponse.json({ message: result.message }, { status: 401 });
      }
      return NextResponse.json({ ok: true });
    }

    const result = await verifyUser(userName, pin);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 401 });
    }
    return NextResponse.json({ ok: true, firstTime: false, isManager: result.isManager });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json({ ok: true, firstTime: false, isManager: false });
    }
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json({ message }, { status: 500 });
  }
}
