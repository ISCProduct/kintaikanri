import type { CorrectionRequest, CorrectionStatus } from "@/types/correction";
import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient } from "@/server/supabase-server";
import { upsertAttendanceRecord } from "@/server/attendance-service";
import { cacheLife, cacheTag } from "next/cache";
import { writeAuditLog } from "@/server/audit-service";

const PG_SELECT = `
  select id, user_name, target_date::text, before_start::text, before_end::text,
         after_start::text, after_end::text, reason, status,
         approver_name, approver_comment, created_at::text, updated_at::text
  from correction_requests
`;

export type CorrectionCreateInput = {
  userName: string;
  targetDate: string;
  beforeStart?: string;
  beforeEnd?: string;
  afterStart: string;
  afterEnd?: string;
  reason: string;
};

type Result<T> = { data: T; error: null } | { data: null; error: { message: string } };

function notFound(): Result<never> {
  return { data: null, error: { message: "修正申請が見つかりません。" } };
}

export async function listCorrectionRequests(userName?: string): Promise<{ data: CorrectionRequest[]; error: null }> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 180 });
  cacheTag("correction-requests");
  if (hasDatabaseUrl()) {
    const where = userName ? "where user_name = $1" : "";
    const { rows } = await getPgPool().query<CorrectionRequest>(
      `${PG_SELECT} ${where} order by target_date desc, created_at desc`,
      userName ? [userName] : [],
    );
    return { data: rows, error: null };
  }
  let query = createSupabaseServerClient()
    .from("correction_requests")
    .select("*")
    .order("target_date", { ascending: false });
  if (userName) query = query.eq("user_name", userName);
  const { data } = await query;
  return { data: (data ?? []) as CorrectionRequest[], error: null };
}

export async function createCorrectionRequest(input: CorrectionCreateInput): Promise<{ data: CorrectionRequest; error: null }> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<CorrectionRequest>(
      `insert into correction_requests
         (user_name, target_date, before_start, before_end, after_start, after_end, reason)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, user_name, target_date::text, before_start::text, before_end::text,
                 after_start::text, after_end::text, reason, status,
                 approver_name, approver_comment, created_at::text, updated_at::text`,
      [input.userName, input.targetDate, input.beforeStart ?? null, input.beforeEnd ?? null,
       input.afterStart, input.afterEnd ?? null, input.reason],
    );
    return { data: rows[0], error: null };
  }
  const { data: rows, error } = await createSupabaseServerClient()
    .from("correction_requests")
    .insert({
      user_name: input.userName, target_date: input.targetDate,
      before_start: input.beforeStart ?? null, before_end: input.beforeEnd ?? null,
      after_start: input.afterStart, after_end: input.afterEnd ?? null, reason: input.reason,
    })
    .select("*");
  if (error || !rows?.[0]) throw new Error(error?.message ?? "作成に失敗しました。");
  return { data: rows[0] as CorrectionRequest, error: null };
}

export async function approveCorrectionRequest(
  id: string,
  status: CorrectionStatus,
  approverName: string,
  approverComment?: string,
): Promise<Result<CorrectionRequest>> {
  let req: CorrectionRequest | null = null;

  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<CorrectionRequest>(
      `update correction_requests
       set status = $1, approver_name = $2, approver_comment = $3, updated_at = now()
       where id = $4
       returning id, user_name, target_date::text, before_start::text, before_end::text,
                 after_start::text, after_end::text, reason, status,
                 approver_name, approver_comment, created_at::text, updated_at::text`,
      [status, approverName, approverComment ?? null, id],
    );
    if (!rows[0]) return notFound();
    req = rows[0];
  } else {
    const { data: rows, error } = await createSupabaseServerClient()
      .from("correction_requests")
      .update({ status, approver_name: approverName, approver_comment: approverComment ?? null, updated_at: new Date().toISOString() })
      .eq("id", id).select("*");
    if (error || !rows?.[0]) return notFound();
    req = rows[0] as CorrectionRequest;
  }

  // 承認時は勤怠レコードを自動更新
  if (status === "approved" && req) {
    await upsertAttendanceRecord({
      userName: req.user_name,
      workDate: req.target_date,
      startTime: req.after_start,
      endTime: req.after_end ?? undefined,
    });
  }

  if (req) {
    await writeAuditLog({
      actorName: approverName,
      action: status === "approved" ? "correction.approve" : "correction.reject",
      entityType: "correction_request",
      entityId: id,
      detail: { user_name: req.user_name, target_date: req.target_date },
    });
  }

  return { data: req, error: null };
}

export async function deleteCorrectionRequest(id: string): Promise<{ error: { message: string } | null }> {
  if (hasDatabaseUrl()) {
    const { rowCount } = await getPgPool().query("delete from correction_requests where id = $1", [id]);
    if (!rowCount) return { error: { message: "修正申請が見つかりません。" } };
    return { error: null };
  }
  const { error } = await createSupabaseServerClient().from("correction_requests").delete().eq("id", id);
  return { error: error ? { message: error.message } : null };
}
