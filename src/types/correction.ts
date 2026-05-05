export type CorrectionStatus = "pending" | "approved" | "rejected";

export type CorrectionRequest = {
  id: string;
  user_name: string;
  target_date: string;
  before_start: string | null;
  before_end: string | null;
  after_start: string;
  after_end: string | null;
  reason: string;
  status: CorrectionStatus;
  approver_name: string | null;
  approver_comment: string | null;
  created_at: string;
  updated_at: string;
};
