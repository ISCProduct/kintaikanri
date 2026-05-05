export type OvertimeStatus = "pending" | "approved" | "rejected";

export type OvertimeRequest = {
  id: string;
  user_name: string;
  request_date: string;
  planned_start: string;
  planned_end: string;
  reason: string;
  status: OvertimeStatus;
  approver_name: string | null;
  approver_comment: string | null;
  created_at: string;
  updated_at: string;
};
