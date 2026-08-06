import { timeToMinutes } from "@/lib/attendance-calc";

export type StandardWorkTimes = {
  start: string;
  end: string;
};

export type LateEarlyFlags = {
  isLate: boolean;
  isEarlyLeave: boolean;
};

/** 所定時刻との比較で遅刻・早退を判定（休暇・休日・翌日跨ぎは対象外） */
export function detectLateEarly(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  standard: StandardWorkTimes,
  opts?: { skip?: boolean },
): LateEarlyFlags {
  if (opts?.skip) return { isLate: false, isEarlyLeave: false };
  const start = startTime ? timeToMinutes(startTime.slice(0, 5)) : null;
  const end = endTime ? timeToMinutes(endTime.slice(0, 5)) : null;
  const stdStart = timeToMinutes(standard.start.slice(0, 5));
  const stdEnd = timeToMinutes(standard.end.slice(0, 5));
  const overnight = start !== null && end !== null && end < start;
  return {
    isLate: start !== null && start > stdStart,
    // 翌日跨ぎ退勤は所定終了より早く見えるため早退判定しない
    isEarlyLeave: !overnight && end !== null && end < stdEnd,
  };
}
