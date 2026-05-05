"use client";

import { useState, useEffect } from "react";
import type { AttendanceRecord, AttendanceStatus } from "@/types/attendance";

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

  const month = getMonthStr(monthDate);

  useEffect(() => {
    if (!userName) { setRecords([]); return; }
    setLoading(true);
    void fetch(`/api/attendance?month=${month}`)
      .then((r) => r.json())
      .then((d: { records?: AttendanceRecord[] }) => {
        const all = d.records ?? [];
        setRecords(all.filter((r) => r.user_name === userName));
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [month, userName]);

  const recordMap = Object.fromEntries(records.map((r) => [r.work_date, r]));

  // カレンダーの日付配列を生成
  const year = monthDate.getFullYear();
  const mon = monthDate.getMonth();
  const firstDay = new Date(year, mon, 1).getDay(); // 0=日
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

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
              const isToday = dateStr === today;
              const dow = (firstDay + day - 1) % 7;
              const isSun = dow === 0;
              const isSat = dow === 6;
              return (
                <div
                  key={dateStr}
                  className={`cal-cell ${isToday ? "cal-today" : ""} ${isSun ? "cal-sun" : ""} ${isSat ? "cal-sat" : ""}`}
                  style={rec ? { backgroundColor: statusColors[rec.status] } : undefined}
                >
                  <span className="cal-day-num">{day}</span>
                  {rec && (
                    <div className="cal-record" style={{ color: statusTextColors[rec.status] }}>
                      <span className="cal-status-badge">{statusLabels[rec.status]}</span>
                      <span className="cal-time">{rec.start_time.slice(0, 5)}</span>
                      {rec.end_time && <span className="cal-time">〜{rec.end_time.slice(0, 5)}</span>}
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
          </div>
        </>
      )}
    </div>
  );
}
