export type Database = {
  public: {
    Tables: {
      system_rules: {
        Row: { key: string; value: string; label: string; updated_at: string };
        Insert: { key: string; value: string; label: string; updated_at?: string };
        Update: { key?: string; value?: string; label?: string; updated_at?: string };
        Relationships: [];
      };
      paid_leave_balances: {
        Row: {
          id: string; user_name: string; granted_days: number; used_days: number;
          reason: string | null; target_month: string | null; created_at: string;
        };
        Insert: {
          id?: string; user_name: string; granted_days: number; used_days?: number;
          reason?: string | null; target_month?: string | null; created_at?: string;
        };
        Update: {
          id?: string; user_name?: string; granted_days?: number; used_days?: number;
          reason?: string | null; target_month?: string | null; created_at?: string;
        };
        Relationships: [];
      };
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
      monthly_closings: {
        Row: { month: string; closed_by: string; closed_at: string };
        Insert: { month: string; closed_by: string; closed_at?: string };
        Update: { month?: string; closed_by?: string; closed_at?: string };
        Relationships: [];
      };
      correction_requests: {
        Row: {
          id: string;
          user_name: string;
          target_date: string;
          before_start: string | null;
          before_end: string | null;
          after_start: string;
          after_end: string | null;
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
          target_date: string;
          before_start?: string | null;
          before_end?: string | null;
          after_start: string;
          after_end?: string | null;
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
          target_date?: string;
          before_start?: string | null;
          before_end?: string | null;
          after_start?: string;
          after_end?: string | null;
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
