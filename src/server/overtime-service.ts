import type { OvertimeRequest, OvertimeStatus } from "@/types/overtime";
import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient, shouldUseSupabase } from "@/server/supabase-server";
import { cacheLife, cacheTag } from "next/cache";
import { writeAuditLog } from "@/server/audit-service";

const PG_SELECT = `
  select id, user_name, request_date::text, planned_start::text, planned_end::text,
         reason, status, approver_name, approver_comment,
         created_at::text, updated_at::text
  from overtime_requests
`;

export type OvertimeCreateInput = {
  userName: string;
  requestDate: string;
  plannedStart: string;
  plannedEnd: string;
  reason: string;
};

export type OvertimeApproveInput = {
  status: OvertimeStatus;
  approverName: string;
  approverComment?: string;
};

type ServiceError = { message: string };
type Result<T> = { data: T; error: null } | { data: null; error: ServiceError };

function notFound(): Result<never> {
  return { data: null, error: { message: "残業申請が見つかりません。" } };
}

// ── 一覧 ─────────────────────────────────────────────────────────────────
export async function listOvertimeRequests(
  userName?: string,
): Promise<{ data: OvertimeRequest[]; error: null }> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 180 });
  cacheTag("overtime-requests");
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const where = userName ? "where user_name = $1" : "";
    const { rows } = await pool.query<OvertimeRequest>(
      `${PG_SELECT} ${where} order by request_date desc, created_at desc`,
      userName ? [userName] : [],
    );
    return { data: rows, error: null };
  }

  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("overtime_requests")
    .select("*")
    .order("request_date", { ascending: false });
  if (userName) query = query.eq("user_name", userName);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { data: (data ?? []) as OvertimeRequest[], error: null };
}

// ── 1件取得 ──────────────────────────────────────────────────────────────
export async function getOvertimeRequestById(id: string): Promise<Result<OvertimeRequest>> {
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<OvertimeRequest>(
      `${PG_SELECT} where id = $1`,
      [id],
    );
    if (!rows[0]) return notFound();
    return { data: rows[0], error: null };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("overtime_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return notFound();
  return { data: data as OvertimeRequest, error: null };
}

// ── 申請作成 ──────────────────────────────────────────────────────────────
export async function createOvertimeRequest(
  input: OvertimeCreateInput,
): Promise<{ data: OvertimeRequest; error: null }> {
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<OvertimeRequest>(
      `insert into overtime_requests (user_name, request_date, planned_start, planned_end, reason)
       values ($1, $2, $3, $4, $5)
       returning id, user_name, request_date::text, planned_start::text, planned_end::text,
                 reason, status, approver_name, approver_comment,
                 created_at::text, updated_at::text`,
      [input.userName, input.requestDate, input.plannedStart, input.plannedEnd, input.reason],
    );
    return { data: rows[0], error: null };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("overtime_requests")
    .insert({
      user_name: input.userName,
      request_date: input.requestDate,
      planned_start: input.plannedStart,
      planned_end: input.plannedEnd,
      reason: input.reason,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "作成に失敗しました。");
  return { data: data as OvertimeRequest, error: null };
}

// ── 承認・却下 ────────────────────────────────────────────────────────────
export async function approveOvertimeRequest(
  id: string,
  input: OvertimeApproveInput,
): Promise<Result<OvertimeRequest>> {
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rows } = await pool.query<OvertimeRequest>(
      `update overtime_requests
       set status = $1, approver_name = $2, approver_comment = $3, updated_at = now()
       where id = $4
       returning id, user_name, request_date::text, planned_start::text, planned_end::text,
                 reason, status, approver_name, approver_comment,
                 created_at::text, updated_at::text`,
      [input.status, input.approverName, input.approverComment ?? null, id],
    );
    if (!rows[0]) return notFound();
    await writeAuditLog({
      actorName: input.approverName,
      action: input.status === "approved" ? "overtime.approve" : "overtime.reject",
      entityType: "overtime_request",
      entityId: id,
      detail: { user_name: rows[0].user_name, request_date: rows[0].request_date },
    });
    return { data: rows[0], error: null };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("overtime_requests")
    .update({
      status: input.status,
      approver_name: input.approverName,
      approver_comment: input.approverComment ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return notFound();
  await writeAuditLog({
    actorName: input.approverName,
    action: input.status === "approved" ? "overtime.approve" : "overtime.reject",
    entityType: "overtime_request",
    entityId: id,
    detail: {
      user_name: (data as OvertimeRequest).user_name,
      request_date: (data as OvertimeRequest).request_date,
    },
  });
  return { data: data as OvertimeRequest, error: null };
}

// ── 削除 ─────────────────────────────────────────────────────────────────
export async function deleteOvertimeRequest(
  id: string,
): Promise<{ error: ServiceError | null }> {
  if (hasDatabaseUrl()) {
    const pool = getPgPool();
    const { rowCount } = await pool.query(
      "delete from overtime_requests where id = $1",
      [id],
    );
    if (!rowCount) return { error: { message: "残業申請が見つかりません。" } };
    return { error: null };
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("overtime_requests").delete().eq("id", id);
  if (error) return { error: { message: error.message } };
  return { error: null };
}
