export type SystemRule = {
  key: string;
  value: string;
  label: string;
  updated_at: string;
};

export type PaidLeaveBalance = {
  id: string;
  user_name: string;
  granted_days: number;
  used_days: number;
  reason: string | null;
  target_month: string | null;
  created_at: string;
};

// ユーザーごとの有給残日数サマリー
export type PaidLeaveSummary = {
  user_name: string;
  total_granted: number;
  total_used: number;
  remaining: number;
};

// 月次残業集計結果
export type MonthlyOvertimeSummary = {
  user_name: string;
  month: string;
  total_work_minutes: number;
  overtime_minutes: number;
  overtime_hours: number;
  exceeds_threshold: boolean;
  already_granted: boolean;
};
