"use client";

import { useState, useEffect, useRef } from "react";
import type { AttendanceRecord, AttendanceStatus } from "@/types/attendance";
import type { SystemRule } from "@/types/rules";
import type { Holiday } from "@/types/holiday";
import { detectLateEarly, type StandardWorkTimes } from "@/lib/late-early";

const statusColors: Record<AttendanceStatus, string> = {
  present: "#dbeafe",
  remote:  "#d1fae5",
  vacation: "#fef9c3",
  holiday:  "#f3f4f6",
};
const statusTextColors: Record<AttendanceStatus, string> = {
  present: "#1e40af",
  remote:  "#065f46",
  vacation: "#854d0e",
  holiday:  "#374151",
};
const statusLabels: Record<AttendanceStatus, string> = {
  present: "出社",
  remote: "リモ",
  vacation: "休暇",
  holiday: "休日",
};

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

function getLocalDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Props = { userName: string };

export function AttendanceCalendar({ userName }: Props) {
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [standardTimes, setStandardTimes] = useState<StandardWorkTimes>({ start: "09:00", end: "18:00" });
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const fetchGen = useRef(0);

  const month = getMonthStr(monthDate);

  useEffect(() => {
    void fetch("/api/rules")
      .then((r) => r.json())
      .then((d: { rules?: SystemRule[] }) => {
        const rules = d.rules ?? [];
        const start = rules.find((r) => r.key === "standard_start_time")?.value;
        const end = rules.find((r) => r.key === "standard_end_time")?.value;
        setStandardTimes({
          start: (start ?? "09:00").slice(0, 5),
          end: (end ?? "18:00").slice(0, 5),
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch(`/api/holidays?month=${month}`)
      .then((r) => r.json())
      .then((d: { holidays?: Holiday[] }) => setHolidays(d.holidays ?? []))
      .catch(() => setHolidays([]));
  }, [month]);

  useEffect(() => {
    if (!userName) {
      setRecords([]);
      return;
    }
    const gen = ++fetchGen.current;
    setLoading(true);
    void fetch(`/api/attendance?month=${month}&userName=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((d: { records?: AttendanceRecord[] }) => {
        if (gen !== fetchGen.current) return;
        setRecords((d.records ?? []).filter((r) => r.user_name === userName));
      })
      .catch(() => {
        if (gen !== fetchGen.current) return;
        setRecords([]);
      })
      .finally(() => {
        if (gen === fetchGen.current) setLoading(false);
      });
  }, [month, userName]);

  const recordMap = Object.fromEntries(records.map((r) => [r.work_date, r]));
  const holidayMap = Object.fromEntries(holidays.map((h) => [h.holiday_date, h]));

  // カレンダーの日付配列を生成
  const year = monthDate.getFullYear();
  const mon = monthDate.getMonth();
  const firstDay = new Date(year, mon, 1).getDay(); // 0=日
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const today = getLocalDateString();

  const cells: (number | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  return (
    <div className="calendar-wrap">
      <div className="calendar-header">
        <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
        <span className="calendar-month-label">{year}年 {mon + 1}月</span>
        <button className="cal-nav-btn" onClick={nextMonth}>›</button>
        {loading && <span className="calendar-loading">読込中...</span>}
      </div>

      {!userName && (
        <p className="description" style={{ textAlign: "center", padding: "2rem" }}>
          氏名を選択するとカレンダーが表示されます。
        </p>
      )}

      {userName && (
        <>
          <div className="calendar-grid">
            {WEEK.map((w, i) => (
              <div key={w} className={`cal-weekday ${i === 0 ? "cal-sun" : i === 6 ? "cal-sat" : ""}`}>
                {w}
              </div>
            ))}
            {cells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} className="cal-cell cal-cell-empty" />;
              const dateStr = `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const rec = recordMap[dateStr];
              const holiday = holidayMap[dateStr];
              const isToday = dateStr === today;
              const dow = (firstDay + day - 1) % 7;
              const isSun = dow === 0;
              const isSat = dow === 6;
              const flags = rec
                ? detectLateEarly(rec.start_time, rec.end_time, standardTimes, {
                    skip:
                      rec.status === "vacation" ||
                      rec.status === "holiday" ||
                      (rec.note?.includes("有給") ?? false),
                  })
                : { isLate: false, isEarlyLeave: false };
              return (
                <div
                  key={dateStr}
                  className={`cal-cell ${isToday ? "cal-today" : ""} ${isSun ? "cal-sun" : ""} ${isSat ? "cal-sat" : ""} ${holiday ? "cal-holiday" : ""}`}
                  style={rec ? { backgroundColor: statusColors[rec.status] } : holiday ? { backgroundColor: "#fce7f3" } : undefined}
                >
                  <span className="cal-day-num">{day}</span>
                  {holiday && !rec && (
                    <div className="cal-record" style={{ color: "#9d174d" }}>
                      <span className="cal-status-badge">{holiday.kind === "national" ? "祝日" : "会社休"}</span>
                      <span className="cal-time">{holiday.name}</span>
                    </div>
                  )}
                  {rec && (
                    <div className="cal-record" style={{ color: statusTextColors[rec.status] }}>
                      <span className="cal-status-badge">{statusLabels[rec.status]}</span>
                      {holiday && <span className="cal-time" style={{ color: "#9d174d" }}>{holiday.name}</span>}
                      <span className="cal-time">{rec.start_time.slice(0, 5)}</span>
                      {rec.end_time && <span className="cal-time">〜{rec.end_time.slice(0, 5)}</span>}
                      {(flags.isLate || flags.isEarlyLeave) && (
                        <span className="cal-flags">
                          {flags.isLate && <span className="flag-late">遅</span>}
                          {flags.isEarlyLeave && <span className="flag-early">早</span>}
                        </span>
                      )}
                      {rec.overtime_start && (
                        <span className="cal-time cal-overtime">残業 {rec.overtime_start.slice(0, 5)}〜</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="calendar-legend">
            {(Object.keys(statusLabels) as AttendanceStatus[]).map((s) => (
              <span key={s} className="legend-item" style={{ background: statusColors[s], color: statusTextColors[s] }}>
                {statusLabels[s]}
              </span>
            ))}
            <span className="legend-item" style={{ background: "#fce7f3", color: "#9d174d" }}>祝日/会社休</span>
            <span className="legend-item"><span className="flag-late">遅</span> 遅刻</span>
            <span className="legend-item"><span className="flag-early">早</span> 早退</span>
          </div>
        </>
      )}
    </div>
  );
}
