import { createHash } from "crypto";
import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient, shouldUseSupabase } from "@/server/supabase-server";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export type VerifyResult =
  | { ok: true; firstTime: boolean }
  | { ok: false; message: string };

export async function verifyOrRegisterUser(userName: string, password: string): Promise<VerifyResult> {
  const hash = hashPassword(password);

  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<{ password_hash: string }>(
      "select password_hash from user_profiles where user_name = $1",
      [userName],
    );
    if (!rows[0]) {
      await pool.query(
        "insert into user_profiles (user_name, password_hash) values ($1, $2)",
        [userName, hash],
      );
      return { ok: true, firstTime: true };
    }
    if (rows[0].password_hash !== hash) {
      return { ok: false, message: "パスワードが違います。" };
    }
    return { ok: true, firstTime: false };
  }

  if (shouldUseSupabase()) {
    const supabase = createSupabaseServerClient();
    const { data: rows } = await supabase
      .from("user_profiles")
      .select("password_hash")
      .eq("user_name", userName);
    const existing = (rows?.[0] ?? null) as { password_hash: string } | null;
    if (!existing) {
      await supabase.from("user_profiles").insert({ user_name: userName, password_hash: hash });
      return { ok: true, firstTime: true };
    }
    if (existing.password_hash !== hash) {
      return { ok: false, message: "パスワードが違います。" };
    }
    return { ok: true, firstTime: false };
  }

  // ローカル開発モードは認証スキップ
  return { ok: true, firstTime: false };
}

export async function changePassword(userName: string, oldPassword: string, newPassword: string): Promise<{ ok: boolean; message?: string }> {
  const oldHash = hashPassword(oldPassword);
  const newHash = hashPassword(newPassword);

  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<{ password_hash: string }>(
      "select password_hash from user_profiles where user_name = $1",
      [userName],
    );
    if (!rows[0] || rows[0].password_hash !== oldHash) {
      return { ok: false, message: "現在のパスワードが違います。" };
    }
    await pool.query("update user_profiles set password_hash = $1 where user_name = $2", [newHash, userName]);
    return { ok: true };
  }

  if (shouldUseSupabase()) {
    const supabase = createSupabaseServerClient();
    const { data: rows } = await supabase
      .from("user_profiles")
      .select("password_hash")
      .eq("user_name", userName);
    const existing = (rows?.[0] ?? null) as { password_hash: string } | null;
    if (!existing || existing.password_hash !== oldHash) {
      return { ok: false, message: "現在のパスワードが違います。" };
    }
    await supabase.from("user_profiles").update({ password_hash: newHash }).eq("user_name", userName);
    return { ok: true };
  }

  return { ok: true };
}
