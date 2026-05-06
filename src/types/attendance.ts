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

export type AttendanceEventType = "break_start" | "break_end" | "outing_start" | "outing_return";

export type AttendanceEvent = {
  id: string;
  user_name: string;
  work_date: string;
  event_type: AttendanceEventType;
  event_time: string;
  created_at: string;
};
