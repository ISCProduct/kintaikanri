export type HolidayKind = "national" | "company";

export type Holiday = {
  holiday_date: string;
  name: string;
  kind: HolidayKind;
  created_at?: string;
};

/** 内閣府公開ベースの国民の祝日・休日（2025–2027） */
export const NATIONAL_HOLIDAY_SEED: Omit<Holiday, "created_at">[] = [
  // 2025
  { holiday_date: "2025-01-01", name: "元日", kind: "national" },
  { holiday_date: "2025-01-13", name: "成人の日", kind: "national" },
  { holiday_date: "2025-02-11", name: "建国記念の日", kind: "national" },
  { holiday_date: "2025-02-23", name: "天皇誕生日", kind: "national" },
  { holiday_date: "2025-02-24", name: "振替休日", kind: "national" },
  { holiday_date: "2025-03-20", name: "春分の日", kind: "national" },
  { holiday_date: "2025-04-29", name: "昭和の日", kind: "national" },
  { holiday_date: "2025-05-03", name: "憲法記念日", kind: "national" },
  { holiday_date: "2025-05-04", name: "みどりの日", kind: "national" },
  { holiday_date: "2025-05-05", name: "こどもの日", kind: "national" },
  { holiday_date: "2025-05-06", name: "振替休日", kind: "national" },
  { holiday_date: "2025-07-21", name: "海の日", kind: "national" },
  { holiday_date: "2025-08-11", name: "山の日", kind: "national" },
  { holiday_date: "2025-09-15", name: "敬老の日", kind: "national" },
  { holiday_date: "2025-09-23", name: "秋分の日", kind: "national" },
  { holiday_date: "2025-10-13", name: "スポーツの日", kind: "national" },
  { holiday_date: "2025-11-03", name: "文化の日", kind: "national" },
  { holiday_date: "2025-11-23", name: "勤労感謝の日", kind: "national" },
  { holiday_date: "2025-11-24", name: "振替休日", kind: "national" },
  // 2026
  { holiday_date: "2026-01-01", name: "元日", kind: "national" },
  { holiday_date: "2026-01-12", name: "成人の日", kind: "national" },
  { holiday_date: "2026-02-11", name: "建国記念の日", kind: "national" },
  { holiday_date: "2026-02-23", name: "天皇誕生日", kind: "national" },
  { holiday_date: "2026-03-20", name: "春分の日", kind: "national" },
  { holiday_date: "2026-04-29", name: "昭和の日", kind: "national" },
  { holiday_date: "2026-05-03", name: "憲法記念日", kind: "national" },
  { holiday_date: "2026-05-04", name: "みどりの日", kind: "national" },
  { holiday_date: "2026-05-05", name: "こどもの日", kind: "national" },
  { holiday_date: "2026-05-06", name: "振替休日", kind: "national" },
  { holiday_date: "2026-07-20", name: "海の日", kind: "national" },
  { holiday_date: "2026-08-11", name: "山の日", kind: "national" },
  { holiday_date: "2026-09-21", name: "敬老の日", kind: "national" },
  { holiday_date: "2026-09-22", name: "国民の休日", kind: "national" },
  { holiday_date: "2026-09-23", name: "秋分の日", kind: "national" },
  { holiday_date: "2026-10-12", name: "スポーツの日", kind: "national" },
  { holiday_date: "2026-11-03", name: "文化の日", kind: "national" },
  { holiday_date: "2026-11-23", name: "勤労感謝の日", kind: "national" },
  // 2027
  { holiday_date: "2027-01-01", name: "元日", kind: "national" },
  { holiday_date: "2027-01-11", name: "成人の日", kind: "national" },
  { holiday_date: "2027-02-11", name: "建国記念の日", kind: "national" },
  { holiday_date: "2027-02-23", name: "天皇誕生日", kind: "national" },
  { holiday_date: "2027-03-21", name: "春分の日", kind: "national" },
  { holiday_date: "2027-03-22", name: "振替休日", kind: "national" },
  { holiday_date: "2027-04-29", name: "昭和の日", kind: "national" },
  { holiday_date: "2027-05-03", name: "憲法記念日", kind: "national" },
  { holiday_date: "2027-05-04", name: "みどりの日", kind: "national" },
  { holiday_date: "2027-05-05", name: "こどもの日", kind: "national" },
  { holiday_date: "2027-07-19", name: "海の日", kind: "national" },
  { holiday_date: "2027-08-11", name: "山の日", kind: "national" },
  { holiday_date: "2027-09-20", name: "敬老の日", kind: "national" },
  { holiday_date: "2027-09-23", name: "秋分の日", kind: "national" },
  { holiday_date: "2027-10-11", name: "スポーツの日", kind: "national" },
  { holiday_date: "2027-11-03", name: "文化の日", kind: "national" },
  { holiday_date: "2027-11-23", name: "勤労感謝の日", kind: "national" },
];
