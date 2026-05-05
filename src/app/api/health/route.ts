import { NextResponse } from "next/server";
import { listAttendanceRecords } from "@/server/attendance-service";
import { isSupabaseConfigured, shouldUseSupabase } from "@/server/supabase-server";
import { hasDatabaseUrl } from "@/server/pg-client";

export async function GET() {
  if (hasDatabaseUrl()) {
    const { error } = await listAttendanceRecords(1);
    if (error) {
      return NextResponse.json({
        status: "degraded",
        app: "ok",
        mode: "postgres",
        message: `DB接続エラー: ${error.message}`,
      });
    }
    return NextResponse.json({
      status: "ok",
      app: "ok",
      mode: "postgres",
      message: "PostgreSQLコンテナに正常接続中です。",
    });
  }

  if (!shouldUseSupabase()) {
    return NextResponse.json({
      status: "ok",
      app: "ok",
      mode: "local-mock",
      supabaseConfigured: false,
      message: "ローカルモードで動作中です（Supabase未使用）。",
    });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      status: "degraded",
      app: "ok",
      mode: "supabase",
      supabaseConfigured: false,
      message: "Supabase環境変数が未設定です。.env.local と Vercel の Environment Variables を設定してください。",
    });
  }

  const { error } = await listAttendanceRecords(1);
  if (error) {
    return NextResponse.json({
      status: "degraded",
      app: "ok",
      mode: "supabase",
      supabaseConfigured: true,
      message: `Supabase接続エラー: ${error.message}`,
    });
  }

  return NextResponse.json({
    status: "ok",
    app: "ok",
    mode: "supabase",
    supabaseConfigured: true,
    message: "アプリとSupabaseの接続は正常です。",
  });
}
