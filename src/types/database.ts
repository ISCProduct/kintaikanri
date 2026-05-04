export type Database = {
  public: {
    Tables: {
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
