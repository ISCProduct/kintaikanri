import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const PLACEHOLDER_URL = "https://your-project-ref.supabase.co";
const PLACEHOLDER_KEY = "your-anon-key";
const CONFIG_ERROR_MESSAGE =
  "Supabase環境変数が未設定です。NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。";

function isPlaceholderValue(url: string, key: string) {
  return url === PLACEHOLDER_URL || key === PLACEHOLDER_KEY;
}

export function isSupabaseConfigured() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return false;
  }

  if (isPlaceholderValue(supabaseUrl, supabaseAnonKey)) {
    return false;
  }

  return true;
}

export function isSupabaseConfigurationError(error: unknown) {
  return error instanceof Error && error.message === CONFIG_ERROR_MESSAGE;
}

export function shouldUseSupabase() {
  const useSupabase = process.env.USE_SUPABASE;

  if (useSupabase === "true") {
    return true;
  }

  if (useSupabase === "false") {
    return false;
  }

  // 環境変数が明示されていない場合は、Supabase が実際に設定済みの場合のみ使用する
  return isSupabaseConfigured();
}

export function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || isPlaceholderValue(supabaseUrl, supabaseAnonKey)) {
    throw new Error(CONFIG_ERROR_MESSAGE);
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}
