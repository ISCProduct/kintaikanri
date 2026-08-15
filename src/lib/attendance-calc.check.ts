import assert from "node:assert/strict";
import { calcWork, calcOvertimeDuration } from "./attendance-calc.ts";

// AC1: 23:00〜翌1:00の残業申請は2時間として計算される
assert.equal(calcOvertimeDuration("23:00", "01:00"), 120);

// AC2相当: 同時刻は0分（呼び出し側で別途バリデーションする前提）
assert.equal(calcOvertimeDuration("18:00", "18:00"), 0);

// 日をまたがない通常ケース
assert.equal(calcOvertimeDuration("18:00", "20:30"), 150);

// AC5: 出勤22:00・残業開始23:30・退勤翌2:00 → 残業2.5時間（90a9051の日跨ぎ補正の回帰確認）
const overnight = calcWork("22:00", "02:00", [], "23:30");
assert.equal(overnight.overtime, 150);
assert.equal(overnight.work, 240);

console.log("attendance-calc.check.ts: all checks passed");
