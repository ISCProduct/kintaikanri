export type LeaveStatus = "pending" | "approved" | "rejected";
/** 時間区分（全日 / 半休） */
export type LeaveType = "full" | "half_am" | "half_pm";
/** 休暇の性質 */
export type LeaveCategory = "paid" | "sick" | "special" | "absence" | "compensatory";

export type LeaveRequest = {
  id: string;
  user_name: string;
  leave_date: string;
  leave_type: LeaveType;
  leave_category: LeaveCategory;
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

export const leaveCategoryLabels: Record<LeaveCategory, string> = {
  paid: "有給休暇",
  sick: "病気休暇",
  special: "特別休暇",
  absence: "欠勤",
  compensatory: "代休・振替",
};

export function leaveTypeToDays(leaveType: LeaveType): number {
  return leaveType === "full" ? 1 : 0.5;
}

export function consumesPaidLeave(category: LeaveCategory): boolean {
  return category === "paid";
}
