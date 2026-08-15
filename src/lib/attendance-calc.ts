import type { AttendanceEvent } from "@/types/attendance";

export const STANDARD_WORK_MINUTES = 8 * 60;
const DAY_MINUTES = 24 * 60;

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

/**
 * 出勤起点の連続タイムライン上の分に変換する。
 * 翌日跨ぎ勤務では、出勤より早い時刻（深夜帯）に 24h を加算する。
 */
function toShiftMinutes(
  time: string,
  shiftStartMin: number,
  overnight: boolean,
): number {
  let m = timeToMinutes(time.slice(0, 5));
  if (overnight && m < shiftStartMin) {
    m += DAY_MINUTES;
  }
  return m;
}

/** 休憩・外出のペア時間を合算（未完了ペアは無視）。翌日跨ぎ対応。 */
export function calcDeductionMinutes(
  events: AttendanceEvent[],
  shiftStart: string | null = null,
  overnight = false,
): number {
  return calcPairedMinutes(events, null, null, shiftStart, overnight);
}

/**
 * rangeStart〜rangeEnd（出勤起点タイムライン）に重なる休憩・外出時間を合算。
 * range が null の場合は全日分。
 */
function calcPairedMinutes(
  events: AttendanceEvent[],
  rangeStartMin: number | null,
  rangeEndMin: number | null,
  shiftStart: string | null,
  overnight: boolean,
): number {
  const shiftStartMin = shiftStart ? timeToMinutes(shiftStart.slice(0, 5)) : 0;
  let total = 0;
  let pairStart: number | null = null;
  let pairKind: "break" | "outing" | null = null;

  const ordered = [...events]
    .map((evt) => ({
      evt,
      t: toShiftMinutes(evt.event_time, shiftStartMin, overnight),
    }))
    .sort((a, b) => a.t - b.t);

  for (const { evt, t } of ordered) {
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
      // ペア自体が逆転している場合（稀）も跨ぎ補正
      if (to < from) to += DAY_MINUTES;
      if (rangeStartMin !== null) from = Math.max(from, rangeStartMin);
      if (rangeEndMin !== null) to = Math.min(to, rangeEndMin);
      total += Math.max(0, to - from);
      pairStart = null;
      pairKind = null;
    }
  }
  return total;
}

/** 残業申請の予定時間数（分）を計算。終了 &lt; 開始は翌日跨ぎとして扱う。 */
export function calcOvertimeDuration(start: string, end: string): number {
  const startMin = timeToMinutes(start.slice(0, 5));
  let endMin = timeToMinutes(end.slice(0, 5));
  if (endMin < startMin) endMin += DAY_MINUTES;
  return endMin - startMin;
}

/**
 * 勤務・残業分を計算。
 * - 勤務 = (退勤−出勤) − 休憩・外出（翌日跨ぎ対応）
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
  let endMin = timeToMinutes(end.slice(0, 5));
  const overnight = endMin < startMin;
  if (overnight) endMin += DAY_MINUTES;

  const breakMinutes = calcPairedMinutes(
    events,
    null,
    null,
    start.slice(0, 5),
    overnight,
  );
  const gross = Math.max(0, endMin - startMin);
  const work = Math.max(0, gross - breakMinutes);

  if (overtimeStart) {
    const otStartMin = toShiftMinutes(
      overtimeStart,
      startMin,
      overnight,
    );
    const otGross = Math.max(0, endMin - otStartMin);
    const otDeduction = calcPairedMinutes(
      events,
      otStartMin,
      endMin,
      start.slice(0, 5),
      overnight,
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
