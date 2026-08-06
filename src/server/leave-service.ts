import type { LeaveRequest, LeaveStatus, LeaveType } from "@/types/leave";
import { leaveTypeToDays } from "@/types/leave";
import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient, shouldUseSupabase } from "@/server/supabase-server";
import { upsertAttendanceRecord } from "@/server/attendance-service";
import { recordVacationUsed } from "@/server/rules-service";
import { isMonthClosed } from "@/server/closing-service";

const PG_SELECT = `
  select id, user_name, leave_date::text, leave_type, days::float8, reason, status,
         approver_name, approver_comment, created_at::text, updated_at::text
  from leave_requests
`;

export type LeaveCreateInput = {
  userName: string;
  leaveDate: string;
  leaveType: LeaveType;
  reason: string;
};

export type LeaveApproveInput = {
  status: LeaveStatus;
  approverName: string;
  approverComment?: string;
};

type ServiceError = { message: string };
type Result<T> = { data: T; error: null } | { data: null; error: ServiceError };

function notFound(): Result<never> {
  return { data: null, error: { message: "有給申請が見つかりません。" } };
}

export async function listLeaveRequests(
  userName?: string,
): Promise<{ data: LeaveRequest[]; error: null }> {
  if (hasDatabaseUrl()) {
    const where = userName ? "where user_name = $1" : "";
    const { rows } = await getPgPool().query<LeaveRequest>(
      `${PG_SELECT} ${where} order by leave_date desc, created_at desc`,
      userName ? [userName] : [],
    );
    return { data: rows, error: null };
  }

  if (!shouldUseSupabase()) return { data: [], error: null };

  let query = createSupabaseServerClient()
    .from("leave_requests")
    .select("*")
    .order("leave_date", { ascending: false });
  if (userName) query = query.eq("user_name", userName);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { data: (data ?? []) as LeaveRequest[], error: null };
}

export async function getLeaveRequestById(id: string): Promise<Result<LeaveRequest>> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<LeaveRequest>(`${PG_SELECT} where id = $1`, [id]);
    if (!rows[0]) return notFound();
    return { data: rows[0], error: null };
  }
  if (!shouldUseSupabase()) return notFound();
  const { data, error } = await createSupabaseServerClient()
    .from("leave_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return notFound();
  return { data: data as LeaveRequest, error: null };
}

export async function createLeaveRequest(
  input: LeaveCreateInput,
): Promise<Result<LeaveRequest>> {
  const month = input.leaveDate.slice(0, 7);
  if (await isMonthClosed(month)) {
    return { data: null, error: { message: `${month} は締め済みのため申請できません。` } };
  }
  const days = leaveTypeToDays(input.leaveType);

  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<LeaveRequest>(
      `insert into leave_requests (user_name, leave_date, leave_type, days, reason)
       values ($1, $2, $3, $4, $5)
       returning id, user_name, leave_date::text, leave_type, days::float8, reason, status,
                 approver_name, approver_comment, created_at::text, updated_at::text`,
      [input.userName, input.leaveDate, input.leaveType, days, input.reason],
    );
    return { data: rows[0], error: null };
  }

  if (!shouldUseSupabase()) {
    return { data: null, error: { message: "データベース未設定です。" } };
  }

  const { data, error } = await createSupabaseServerClient()
    .from("leave_requests")
    .insert({
      user_name: input.userName,
      leave_date: input.leaveDate,
      leave_type: input.leaveType,
      days,
      reason: input.reason,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { data: null, error: { message: error?.message ?? "申請の作成に失敗しました。" } };
  }
  return { data: data as LeaveRequest, error: null };
}

export async function approveLeaveRequest(
  id: string,
  input: LeaveApproveInput,
): Promise<Result<LeaveRequest>> {
  const current = await getLeaveRequestById(id);
  if (current.error || !current.data) return notFound();
  if (current.data.status !== "pending") {
    return { data: null, error: { message: "処理済みの申請です。" } };
  }

  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<LeaveRequest>(
      `update leave_requests
       set status = $1, approver_name = $2, approver_comment = $3, updated_at = now()
       where id = $4
       returning id, user_name, leave_date::text, leave_type, days::float8, reason, status,
                 approver_name, approver_comment, created_at::text, updated_at::text`,
      [input.status, input.approverName, input.approverComment ?? null, id],
    );
    if (!rows[0]) return notFound();
    if (input.status === "approved") {
      await applyApprovedLeave(rows[0]);
    }
    return { data: rows[0], error: null };
  }

  if (!shouldUseSupabase()) {
    return { data: null, error: { message: "データベース未設定です。" } };
  }

  const { data, error } = await createSupabaseServerClient()
    .from("leave_requests")
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
  const request = data as LeaveRequest;
  if (input.status === "approved") {
    await applyApprovedLeave(request);
  }
  return { data: request, error: null };
}

async function applyApprovedLeave(request: LeaveRequest): Promise<void> {
  const note =
    request.leave_type === "full"
      ? `有給（全休）: ${request.reason}`
      : request.leave_type === "half_am"
        ? `有給（午前半休）: ${request.reason}`
        : `有給（午後半休）: ${request.reason}`;

  // 全日は休暇ステータス。半休は出社扱いで備考に残す（開始/終了は仮の所定）
  if (request.leave_type === "full") {
    await upsertAttendanceRecord({
      userName: request.user_name,
      workDate: request.leave_date,
      startTime: "00:00",
      endTime: "00:00",
      status: "vacation",
      note,
    });
  } else {
    await upsertAttendanceRecord({
      userName: request.user_name,
      workDate: request.leave_date,
      startTime: request.leave_type === "half_am" ? "13:00" : "09:00",
      endTime: request.leave_type === "half_am" ? "18:00" : "12:00",
      status: "present",
      note,
    });
  }
  await recordVacationUsed(request.user_name, request.leave_date, request.days);
}

export async function deleteLeaveRequest(id: string): Promise<Result<true>> {
  const current = await getLeaveRequestById(id);
  if (current.error || !current.data) return notFound();
  if (current.data.status !== "pending") {
    return { data: null, error: { message: "申請中のみ取消できます。" } };
  }

  if (hasDatabaseUrl()) {
    await getPgPool().query("delete from leave_requests where id = $1", [id]);
    return { data: true, error: null };
  }
  if (!shouldUseSupabase()) {
    return { data: null, error: { message: "データベース未設定です。" } };
  }
  const { error } = await createSupabaseServerClient().from("leave_requests").delete().eq("id", id);
  if (error) return { data: null, error: { message: error.message } };
  return { data: true, error: null };
}
