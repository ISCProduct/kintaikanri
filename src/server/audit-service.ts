import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient, shouldUseSupabase } from "@/server/supabase-server";

export type AuditLog = {
  id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

export async function writeAuditLog(input: {
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    if (hasDatabaseUrl()) {
      await getPgPool().query(
        `insert into audit_logs (actor_name, action, entity_type, entity_id, detail)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [
          input.actorName,
          input.action,
          input.entityType,
          input.entityId ?? null,
          input.detail ? JSON.stringify(input.detail) : null,
        ],
      );
      return;
    }
    if (!shouldUseSupabase()) return;
    await createSupabaseServerClient().from("audit_logs").insert({
      actor_name: input.actorName,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      detail: input.detail ?? null,
    });
  } catch (e) {
    // 監査ログ失敗で本体処理を止めない
    console.error("[audit]", e);
  }
}

export async function listAuditLogs(limit = 100): Promise<AuditLog[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<AuditLog>(
      `select id, actor_name, action, entity_type, entity_id, detail, created_at::text
       from audit_logs
       order by created_at desc
       limit $1`,
      [safeLimit],
    );
    return rows;
  }
  if (!shouldUseSupabase()) return [];
  const { data, error } = await createSupabaseServerClient()
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditLog[];
}
