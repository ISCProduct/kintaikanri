import type { LeaveCategory, LeaveRequest, LeaveStatus, LeaveType } from "@/types/leave";
import {
  consumesPaidLeave,
  leaveCategoryLabels,
  leaveTypeLabels,
  leaveTypeToDays,
} from "@/types/leave";
import { getPgPool, hasDatabaseUrl } from "@/server/pg-client";
import { createSupabaseServerClient, shouldUseSupabase } from "@/server/supabase-server";
import { upsertAttendanceRecord } from "@/server/attendance-service";
import { getUserPaidLeaveBalance, recordVacationUsed } from "@/server/rules-service";
import { isMonthClosed } from "@/server/closing-service";
import { writeAuditLog } from "@/server/audit-service";

const PG_SELECT = `
  select id, user_name, leave_date::text, leave_type,
         coalesce(leave_category, 'paid') as leave_category,
         days::float8, reason, status,
         approver_name, approver_comment, created_at::text, updated_at::text
  from leave_requests
`;

export type LeaveCreateInput = {
  userName: string;
  leaveDate: string;
  leaveType: LeaveType;
  leaveCategory: LeaveCategory;
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
  return { data: null, error: { message: "休暇申請が見つかりません。" } };
}

function normalizeLeave(row: LeaveRequest): LeaveRequest {
  return {
    ...row,
    leave_category: row.leave_category ?? "paid",
    days: Number(row.days),
  };
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
    return { data: rows.map(normalizeLeave), error: null };
  }

  if (!shouldUseSupabase()) return { data: [], error: null };

  let query = createSupabaseServerClient()
    .from("leave_requests")
    .select("*")
    .order("leave_date", { ascending: false });
  if (userName) query = query.eq("user_name", userName);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { data: ((data ?? []) as LeaveRequest[]).map(normalizeLeave), error: null };
}

export async function getLeaveRequestById(id: string): Promise<Result<LeaveRequest>> {
  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<LeaveRequest>(`${PG_SELECT} where id = $1`, [id]);
    if (!rows[0]) return notFound();
    return { data: normalizeLeave(rows[0]), error: null };
  }
  if (!shouldUseSupabase()) return notFound();
  const { data, error } = await createSupabaseServerClient()
    .from("leave_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return notFound();
  return { data: normalizeLeave(data as LeaveRequest), error: null };
}

async function assertPaidLeaveBalance(userName: string, days: number): Promise<ServiceError | null> {
  const balance = await getUserPaidLeaveBalance(userName);
  const remaining = balance?.remaining ?? 0;
  if (remaining < days) {
    return {
      message: `有給残日数が不足しています（残 ${remaining} 日 / 申請 ${days} 日）。`,
    };
  }
  return null;
}

export async function createLeaveRequest(
  input: LeaveCreateInput,
): Promise<Result<LeaveRequest>> {
  const month = input.leaveDate.slice(0, 7);
  if (await isMonthClosed(month)) {
    return { data: null, error: { message: `${month} は締め済みのため申請できません。` } };
  }

  // 有給以外は全日のみ
  const leaveType: LeaveType =
    input.leaveCategory === "paid" ? input.leaveType : "full";
  const days = leaveTypeToDays(leaveType);

  if (consumesPaidLeave(input.leaveCategory)) {
    const balanceError = await assertPaidLeaveBalance(input.userName, days);
    if (balanceError) return { data: null, error: balanceError };
  }

  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<LeaveRequest>(
      `insert into leave_requests (user_name, leave_date, leave_type, leave_category, days, reason)
       values ($1, $2, $3, $4, $5, $6)
       returning id, user_name, leave_date::text, leave_type,
                 coalesce(leave_category, 'paid') as leave_category,
                 days::float8, reason, status,
                 approver_name, approver_comment, created_at::text, updated_at::text`,
      [input.userName, input.leaveDate, leaveType, input.leaveCategory, days, input.reason],
    );
    const created = normalizeLeave(rows[0]);
    await writeAuditLog({
      actorName: input.userName,
      action: "leave.create",
      entityType: "leave_request",
      entityId: created.id,
      detail: {
        leave_date: created.leave_date,
        leave_category: created.leave_category,
        leave_type: created.leave_type,
      },
    });
    return { data: created, error: null };
  }

  if (!shouldUseSupabase()) {
    return { data: null, error: { message: "データベース未設定です。" } };
  }

  const { data, error } = await createSupabaseServerClient()
    .from("leave_requests")
    .insert({
      user_name: input.userName,
      leave_date: input.leaveDate,
      leave_type: leaveType,
      leave_category: input.leaveCategory,
      days,
      reason: input.reason,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { data: null, error: { message: error?.message ?? "申請の作成に失敗しました。" } };
  }
  const created = normalizeLeave(data as LeaveRequest);
  await writeAuditLog({
    actorName: input.userName,
    action: "leave.create",
    entityType: "leave_request",
    entityId: created.id,
    detail: {
      leave_date: created.leave_date,
      leave_category: created.leave_category,
      leave_type: created.leave_type,
    },
  });
  return { data: created, error: null };
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

  if (input.status === "approved" && consumesPaidLeave(current.data.leave_category)) {
    const balanceError = await assertPaidLeaveBalance(current.data.user_name, current.data.days);
    if (balanceError) return { data: null, error: balanceError };
  }

  if (hasDatabaseUrl()) {
    const { rows } = await getPgPool().query<LeaveRequest>(
      `update leave_requests
       set status = $1, approver_name = $2, approver_comment = $3, updated_at = now()
       where id = $4
       returning id, user_name, leave_date::text, leave_type,
                 coalesce(leave_category, 'paid') as leave_category,
                 days::float8, reason, status,
                 approver_name, approver_comment, created_at::text, updated_at::text`,
      [input.status, input.approverName, input.approverComment ?? null, id],
    );
    if (!rows[0]) return notFound();
    const updated = normalizeLeave(rows[0]);
    if (input.status === "approved") {
      await applyApprovedLeave(updated);
    }
    await writeAuditLog({
      actorName: input.approverName,
      action: input.status === "approved" ? "leave.approve" : "leave.reject",
      entityType: "leave_request",
      entityId: id,
      detail: { user_name: updated.user_name, leave_date: updated.leave_date },
    });
    return { data: updated, error: null };
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
  const request = normalizeLeave(data as LeaveRequest);
  if (input.status === "approved") {
    await applyApprovedLeave(request);
  }
  await writeAuditLog({
    actorName: input.approverName,
    action: input.status === "approved" ? "leave.approve" : "leave.reject",
    entityType: "leave_request",
    entityId: id,
    detail: { user_name: request.user_name, leave_date: request.leave_date },
  });
  return { data: request, error: null };
}

async function applyApprovedLeave(request: LeaveRequest): Promise<void> {
  const categoryLabel = leaveCategoryLabels[request.leave_category];
  const typeLabel = leaveTypeLabels[request.leave_type];
  const note = `${categoryLabel}（${typeLabel}）: ${request.reason}`;

  const attendanceStatus =
    request.leave_category === "absence"
      ? "holiday"
      : request.leave_type === "full"
        ? request.leave_category === "compensatory"
          ? "holiday"
          : "vacation"
        : "present";

  if (request.leave_type === "full") {
    await upsertAttendanceRecord({
      userName: request.user_name,
      workDate: request.leave_date,
      startTime: "00:00",
      endTime: "00:00",
      status: attendanceStatus,
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

  if (consumesPaidLeave(request.leave_category)) {
    await recordVacationUsed(request.user_name, request.leave_date, request.days);
  }
}

export async function deleteLeaveRequest(id: string): Promise<Result<true>> {
  const current = await getLeaveRequestById(id);
  if (current.error || !current.data) return notFound();
  if (current.data.status !== "pending") {
    return { data: null, error: { message: "申請中のみ取消できます。" } };
  }

  if (hasDatabaseUrl()) {
    await getPgPool().query("delete from leave_requests where id = $1", [id]);
    await writeAuditLog({
      actorName: current.data.user_name,
      action: "leave.cancel",
      entityType: "leave_request",
      entityId: id,
    });
    return { data: true, error: null };
  }
  if (!shouldUseSupabase()) {
    return { data: null, error: { message: "データベース未設定です。" } };
  }
  const { error } = await createSupabaseServerClient().from("leave_requests").delete().eq("id", id);
  if (error) return { data: null, error: { message: error.message } };
  await writeAuditLog({
    actorName: current.data.user_name,
    action: "leave.cancel",
    entityType: "leave_request",
    entityId: id,
  });
  return { data: true, error: null };
}
