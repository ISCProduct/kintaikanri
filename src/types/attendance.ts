export type AttendanceStatus = "present" | "remote" | "vacation" | "holiday";

export type AttendanceRecord = {
  id: string;
  user_name: string;
  work_date: string;
  start_time: string;
  end_time: string | null;
  overtime_start: string | null;
  status: AttendanceStatus;
  note: string | null;
  created_at: string;
};
