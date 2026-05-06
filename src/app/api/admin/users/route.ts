import { NextResponse } from "next/server";
import { listUserProfiles, setManagerRole, adminCreateUser } from "@/server/user-profile-service";
import { isSupabaseConfigurationError } from "@/server/supabase-server";

export async function GET() {
  try {
    const users = await listUserProfiles();
    return NextResponse.json({ users });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json({ users: [] });
    }
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json({ message }, { status: 500 });
  }
}

type PostPayload = {
  userName?: string;
  initialPin?: string;
};

export async function POST(request: Request) {
  try {
    const { userName, initialPin } = (await request.json()) as PostPayload;
    if (!userName || !initialPin) {
      return NextResponse.json({ message: "userName と initialPin は必須です。" }, { status: 400 });
    }
    if (initialPin.length < 4) {
      return NextResponse.json({ message: "PINは4桁以上にしてください。" }, { status: 400 });
    }
    const result = await adminCreateUser(userName, initialPin);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 409 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json({ ok: true }, { status: 201 });
    }
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json({ message }, { status: 500 });
  }
}

type PatchPayload = {
  userName?: string;
  isManager?: boolean;
};

export async function PATCH(request: Request) {
  try {
    const { userName, isManager } = (await request.json()) as PatchPayload;
    if (!userName || isManager === undefined) {
      return NextResponse.json({ message: "userName と isManager は必須です。" }, { status: 400 });
    }
    await setManagerRole(userName, isManager);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isSupabaseConfigurationError(error)) {
      return NextResponse.json({ ok: true });
    }
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json({ message }, { status: 500 });
  }
}
