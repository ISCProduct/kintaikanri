export type LeaveStatus = "pending" | "approved" | "rejected";
export type LeaveType = "full" | "half_am" | "half_pm";

export type LeaveRequest = {
  id: string;
  user_name: string;
  leave_date: string;
  leave_type: LeaveType;
  days: number;
  reason: string;
  status: LeaveStatus;
  approver_name: string | null;
  approver_comment: string | null;
  created_at: string;
  updated_at: string;
};

export const leaveTypeLabels: Record<LeaveType, string> = {
  full: "全休",
  half_am: "午前半休",
  half_pm: "午後半休",
};

export function leaveTypeToDays(leaveType: LeaveType): number {
  return leaveType === "full" ? 1 : 0.5;
}
