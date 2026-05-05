import type { OvertimeRequest, OvertimeStatus } from "@/types/overtime";
import { getPgPool } from "@/server/pg-client";

const SELECT = `
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
type ServiceResult<T> = { data: T | null; error: ServiceError | null };

function notFound(): ServiceResult<never> {
  return { data: null, error: { message: "残業申請が見つかりません。" } };
}

export async function listOvertimeRequests(userName?: string): Promise<{ data: OvertimeRequest[]; error: null }> {
  const pool = getPgPool();
  const where = userName ? "where user_name = $1" : "";
  const params = userName ? [userName] : [];
  const { rows } = await pool.query<OvertimeRequest>(
    `${SELECT} ${where} order by request_date desc, created_at desc`,
    params,
  );
  return { data: rows, error: null };
}

export async function getOvertimeRequestById(id: string) {
  const pool = getPgPool();
  const { rows } = await pool.query<OvertimeRequest>(
    `${SELECT} where id = $1`,
    [id],
  );
  if (!rows[0]) return notFound();
  return { data: rows[0], error: null };
}

export async function createOvertimeRequest(input: OvertimeCreateInput): Promise<{ data: OvertimeRequest; error: null }> {
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

export async function approveOvertimeRequest(id: string, input: OvertimeApproveInput) {
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
  return { data: rows[0], error: null };
}

export async function deleteOvertimeRequest(id: string) {
  const pool = getPgPool();
  const { rowCount } = await pool.query(
    "delete from overtime_requests where id = $1",
    [id],
  );
  if (!rowCount) return { error: { message: "残業申請が見つかりません。" } };
  return { error: null };
}
