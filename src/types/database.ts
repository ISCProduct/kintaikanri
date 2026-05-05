export type Database = {
  public: {
    Tables: {
      overtime_requests: {
        Row: {
          id: string;
          user_name: string;
          request_date: string;
          planned_start: string;
          planned_end: string;
          reason: string;
          status: "pending" | "approved" | "rejected";
          approver_name: string | null;
          approver_comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_name: string;
          request_date: string;
          planned_start: string;
          planned_end: string;
          reason: string;
          status?: "pending" | "approved" | "rejected";
          approver_name?: string | null;
          approver_comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_name?: string;
          request_date?: string;
          planned_start?: string;
          planned_end?: string;
          reason?: string;
          status?: "pending" | "approved" | "rejected";
          approver_name?: string | null;
          approver_comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      attendance_records: {
        Row: {
          id: string;
          user_name: string;
          work_date: string;
          start_time: string;
          end_time: string | null;
          status: "present" | "remote" | "vacation" | "holiday";
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_name: string;
          work_date: string;
          start_time: string;
          end_time?: string | null;
          status: "present" | "remote" | "vacation" | "holiday";
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_name?: string;
          work_date?: string;
          start_time?: string;
          end_time?: string | null;
          status?: "present" | "remote" | "vacation" | "holiday";
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
