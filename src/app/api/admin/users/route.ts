import { NextResponse } from "next/server";
import { listUserProfiles, setManagerRole } from "@/server/user-profile-service";
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
