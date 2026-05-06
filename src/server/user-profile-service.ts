import { createHash } from "crypto";
import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient, shouldUseSupabase } from "@/server/supabase-server";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

export type UserProfile = {
  user_name: string;
  is_manager: boolean;
  created_at: string;
};

export type VerifyResult =
  | { ok: true; firstTime: boolean; isManager: boolean }
  | { ok: false; message: string };

export async function verifyUser(userName: string, pin: string): Promise<VerifyResult> {
  const hash = hashPin(pin);
  const notRegistered: VerifyResult = { ok: false, message: "このユーザーはPINが未登録です。管理者にPINの発行を依頼してください。" };

  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<{ pin_hash: string; is_manager: boolean }>(
      "select pin_hash, is_manager from user_profiles where user_name = $1",
      [userName],
    );
    if (!rows[0]) return notRegistered;
    if (rows[0].pin_hash !== hash) return { ok: false, message: "PINが違います。" };
    return { ok: true, firstTime: false, isManager: rows[0].is_manager };
  }

  if (shouldUseSupabase()) {
    const supabase = createSupabaseServerClient();
    const { data: rows } = await supabase
      .from("user_profiles")
      .select("pin_hash, is_manager")
      .eq("user_name", userName);
    const existing = (rows?.[0] ?? null) as { pin_hash: string; is_manager: boolean } | null;
    if (!existing) return notRegistered;
    if (existing.pin_hash !== hash) return { ok: false, message: "PINが違います。" };
    return { ok: true, firstTime: false, isManager: existing.is_manager };
  }

  // ローカル開発モードは認証スキップ
  return { ok: true, firstTime: false, isManager: false };
}

export async function adminCreateUser(userName: string, initialPin: string): Promise<{ ok: boolean; message?: string }> {
  const hash = hashPin(initialPin);

  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<{ user_name: string }>(
      "select user_name from user_profiles where user_name = $1",
      [userName],
    );
    if (rows[0]) return { ok: false, message: "このユーザーは既に登録されています。" };
    await pool.query(
      "insert into user_profiles (user_name, pin_hash) values ($1, $2)",
      [userName, hash],
    );
    return { ok: true };
  }

  if (shouldUseSupabase()) {
    const supabase = createSupabaseServerClient();
    const { data: rows } = await supabase
      .from("user_profiles")
      .select("user_name")
      .eq("user_name", userName);
    if (rows?.[0]) return { ok: false, message: "このユーザーは既に登録されています。" };
    const { error } = await supabase.from("user_profiles").insert({ user_name: userName, pin_hash: hash });
    if (error) return { ok: false, message: `登録に失敗しました: ${error.message}` };
    return { ok: true };
  }

  return { ok: true };
}

export async function changePin(userName: string, oldPin: string, newPin: string): Promise<{ ok: boolean; message?: string }> {
  const oldHash = hashPin(oldPin);
  const newHash = hashPin(newPin);

  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<{ pin_hash: string }>(
      "select pin_hash from user_profiles where user_name = $1",
      [userName],
    );
    if (!rows[0] || rows[0].pin_hash !== oldHash) {
      return { ok: false, message: "現在のPINが違います。" };
    }
    await pool.query("update user_profiles set pin_hash = $1 where user_name = $2", [newHash, userName]);
    return { ok: true };
  }

  if (shouldUseSupabase()) {
    const supabase = createSupabaseServerClient();
    const { data: rows } = await supabase
      .from("user_profiles")
      .select("pin_hash")
      .eq("user_name", userName);
    const existing = (rows?.[0] ?? null) as { pin_hash: string } | null;
    if (!existing || existing.pin_hash !== oldHash) {
      return { ok: false, message: "現在のPINが違います。" };
    }
    const { error } = await supabase.from("user_profiles").update({ pin_hash: newHash }).eq("user_name", userName);
    if (error) return { ok: false, message: `PIN変更に失敗しました: ${error.message}` };
    return { ok: true };
  }

  return { ok: true };
}

export async function listUserProfiles(): Promise<UserProfile[]> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<UserProfile>(
      "select user_name, is_manager, created_at::text from user_profiles order by user_name",
    );
    return rows;
  }
  if (shouldUseSupabase()) {
    const { data } = await createSupabaseServerClient()
      .from("user_profiles")
      .select("user_name, is_manager, created_at")
      .order("user_name");
    return (data ?? []) as UserProfile[];
  }
  return [];
}

export async function setManagerRole(userName: string, isManager: boolean): Promise<void> {
  if (hasDatabaseUrl()) {
    await getPgPool().query(
      "update user_profiles set is_manager = $1 where user_name = $2",
      [isManager, userName],
    );
    return;
  }
  if (shouldUseSupabase()) {
    const { error } = await createSupabaseServerClient()
      .from("user_profiles")
      .update({ is_manager: isManager })
      .eq("user_name", userName);
    if (error) throw new Error(`管理者ロール更新に失敗しました: ${error.message}`);
  }
}
