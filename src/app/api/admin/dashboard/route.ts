import { NextResponse } from "next/server";
import { listMissingClockOuts } from "@/server/attendance-service";
import { listOvertimeRequests } from "@/server/overtime-service";
import { listCorrectionRequests } from "@/server/correction-service";
import { listLeaveRequests } from "@/server/leave-service";
import { getMonthlyOvertimeSummary, getPaidLeaveSummaries } from "@/server/rules-service";
import { listMonthlyClosings } from "@/server/closing-service";

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? thisMonth();
  try {
    const [missing, overtime, corrections, leaves, otSummary, leaveSummaries, closings] =
      await Promise.all([
        listMissingClockOuts(),
        listOvertimeRequests(),
        listCorrectionRequests(),
        listLeaveRequests(),
        getMonthlyOvertimeSummary(month).catch(() => []),
        getPaidLeaveSummaries().catch(() => []),
        listMonthlyClosings(),
      ]);

    const pendingOvertime = (overtime.data ?? []).filter((r) => r.status === "pending").length;
    const pendingCorrection = corrections.data.filter((r) => r.status === "pending").length;
    const pendingLeave = leaves.data.filter((r) => r.status === "pending").length;
    const otExceeding = otSummary.filter((o) => o.exceeds_threshold).length;
    const lowLeave = leaveSummaries.filter((s) => s.remaining < 3).length;

    return NextResponse.json(
      {
        month,
        summary: {
          missingClockOuts: missing.length,
          pendingOvertime,
          pendingCorrection,
          pendingLeave,
          pendingTotal: pendingOvertime + pendingCorrection + pendingLeave,
          otExceeding,
          lowLeaveBalance: lowLeave,
          closedMonths: closings.length,
          isMonthClosed: closings.some((c) => c.month === month),
        },
        missingPreview: missing.slice(0, 5),
        otTop: otSummary.slice(0, 5),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
