import type { AttendanceEvent } from "@/types/attendance";

export const STANDARD_WORK_MINUTES = 8 * 60;

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function formatMinutes(min: number): string {
  const safe = Math.max(0, Math.round(min));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

/** 休憩・外出のペア時間を合算（未完了ペアは無視） */
export function calcDeductionMinutes(events: AttendanceEvent[]): number {
  return calcPairedMinutes(events, null, null);
}

/**
 * rangeStart〜rangeEnd に重なる休憩・外出時間を合算。
 * range が null の場合は全日分。
 */
function calcPairedMinutes(
  events: AttendanceEvent[],
  rangeStart: string | null,
  rangeEnd: string | null,
): number {
  const rangeStartMin = rangeStart ? timeToMinutes(rangeStart) : null;
  const rangeEndMin = rangeEnd ? timeToMinutes(rangeEnd) : null;
  let total = 0;
  let pairStart: number | null = null;
  let pairKind: "break" | "outing" | null = null;

  const ordered = [...events].sort((a, b) =>
    a.event_time.localeCompare(b.event_time),
  );

  for (const evt of ordered) {
    const t = timeToMinutes(evt.event_time.slice(0, 5));
    if (evt.event_type === "break_start") {
      pairStart = t;
      pairKind = "break";
    } else if (evt.event_type === "outing_start") {
      pairStart = t;
      pairKind = "outing";
    } else if (
      ((evt.event_type === "break_end" && pairKind === "break") ||
        (evt.event_type === "outing_return" && pairKind === "outing")) &&
      pairStart !== null
    ) {
      let from = pairStart;
      let to = t;
      if (rangeStartMin !== null) from = Math.max(from, rangeStartMin);
      if (rangeEndMin !== null) to = Math.min(to, rangeEndMin);
      total += Math.max(0, to - from);
      pairStart = null;
      pairKind = null;
    }
  }
  return total;
}

/**
 * 勤務・残業分を計算。
 * - 勤務 = (退勤−出勤) − 休憩・外出
 * - 残業開始打刻あり: 残業 = (退勤−残業開始) − その区間の休憩・外出
 * - 残業開始打刻なし: 残業 = max(0, 勤務 − 8時間)
 */
export function calcWork(
  start: string,
  end: string | null,
  events: AttendanceEvent[] = [],
  overtimeStart: string | null = null,
): { work: number; overtime: number; breakMinutes: number } {
  if (!end) return { work: 0, overtime: 0, breakMinutes: 0 };

  const startMin = timeToMinutes(start.slice(0, 5));
  const endMin = timeToMinutes(end.slice(0, 5));
  const breakMinutes = calcDeductionMinutes(events);
  const gross = Math.max(0, endMin - startMin);
  const work = Math.max(0, gross - breakMinutes);

  if (overtimeStart) {
    const otStartMin = timeToMinutes(overtimeStart.slice(0, 5));
    const otGross = Math.max(0, endMin - otStartMin);
    const otDeduction = calcPairedMinutes(
      events,
      overtimeStart.slice(0, 5),
      end.slice(0, 5),
    );
    return {
      work,
      overtime: Math.max(0, otGross - otDeduction),
      breakMinutes,
    };
  }

  return {
    work,
    overtime: Math.max(0, work - STANDARD_WORK_MINUTES),
    breakMinutes,
  };
}
