"use client";

import { useState, useEffect } from "react";
import type { OvertimeRequest, OvertimeStatus } from "@/types/overtime";
import type { CorrectionRequest, CorrectionStatus } from "@/types/correction";
import type { LeaveRequest, LeaveStatus } from "@/types/leave";
import { leaveCategoryLabels, leaveTypeLabels } from "@/types/leave";
import type { AttendanceRecord } from "@/types/attendance";
import type { MonthlyClosing } from "@/server/closing-service";
import type { AuditLog } from "@/server/audit-service";
import type { Holiday, HolidayKind } from "@/types/holiday";
import type { MonthlyOvertimeSummary } from "@/types/rules";

const USER_NAME_KEY = "kintai_user_name";

const statusLabels: Record<OvertimeStatus, string> = {
  pending: "申請中",
  approved: "承認済",
  rejected: "却下",
};

const statusClass: Record<OvertimeStatus | CorrectionStatus | LeaveStatus, string> = {
  pending: "chip-pending",
  approved: "chip-approved",
  rejected: "chip-rejected",
};

type AdminClientProps = {
  initialRequests: OvertimeRequest[];
  initialCorrectionRequests: CorrectionRequest[];
  initialLeaveRequests: LeaveRequest[];
};

function getThisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function AdminClient({
  initialRequests,
  initialCorrectionRequests,
  initialLeaveRequests,
}: AdminClientProps) {
  const [requests, setRequests] = useState<OvertimeRequest[]>(initialRequests);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>(initialCorrectionRequests);
  const [leaves, setLeaves] = useState<LeaveRequest[]>(initialLeaveRequests);
  const [adminName, setAdminName] = useState("");
  const [activeTab, setActiveTab] = useState<"overtime" | "correction" | "leave">("overtime");
  const [filterStatus, setFilterStatus] = useState<OvertimeStatus | "all">("pending");
  const [corrFilterStatus, setCorrFilterStatus] = useState<CorrectionStatus | "all">("pending");
  const [leaveFilterStatus, setLeaveFilterStatus] = useState<LeaveStatus | "all">("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [commentMap, setCommentMap] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [exportMonth, setExportMonth] = useState(getThisMonth());
  const [exportUser, setExportUser] = useState("");
  const [missingRecords, setMissingRecords] = useState<AttendanceRecord[]>([]);
  const [closings, setClosings] = useState<MonthlyClosing[]>([]);
  const [closeTarget, setCloseTarget] = useState(getThisMonth());
  const [closing, setClosing] = useState(false);
  const [dashboard, setDashboard] = useState<{
    summary?: {
      missingClockOuts: number;
      pendingOvertime: number;
      pendingCorrection: number;
      pendingLeave: number;
      pendingTotal: number;
      otExceeding: number;
      lowLeaveBalance: number;
      isMonthClosed: boolean;
    };
    otTop?: MonthlyOvertimeSummary[];
  } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidayKind, setHolidayKind] = useState<HolidayKind>("company");
  const [holidayBusy, setHolidayBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(USER_NAME_KEY) ?? "";
    if (saved) setAdminName(saved);
    void fetch("/api/attendance/missing")
      .then((r) => r.json())
      .then((d: { records?: AttendanceRecord[] }) => setMissingRecords(d.records ?? []))
      .catch(() => undefined);
    void fetch("/api/monthly-closings")
      .then((r) => r.json())
      .then((d: { closings?: MonthlyClosing[] }) => setClosings(d.closings ?? []))
      .catch(() => undefined);
    void fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then((d) => setDashboard(d))
      .catch(() => undefined);
    void fetch("/api/audit-logs?limit=50")
      .then((r) => r.json())
      .then((d: { logs?: AuditLog[] }) => setAuditLogs(d.logs ?? []))
      .catch(() => undefined);
    void fetch("/api/holidays")
      .then((r) => r.json())
      .then((d: { holidays?: Holiday[] }) => setHolidays(d.holidays ?? []))
      .catch(() => undefined);
  }, []);

  const handleOvertimeAction = async (id: string, status: "approved" | "rejected") => {
    if (!adminName.trim()) { setMessage("管理者名を入力してください。"); return; }
    setProcessingId(id);
    setMessage("");
    const res = await fetch(`/api/overtime/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, approverName: adminName.trim(), approverComment: commentMap[id] ?? "" }),
    });
    const data = (await res.json()) as { request?: OvertimeRequest; message?: string };
    if (!res.ok) { setMessage(data.message ?? "操作に失敗しました。"); }
    else if (data.request) { setRequests((prev) => prev.map((r) => (r.id === id ? data.request! : r))); }
    setProcessingId(null);
  };

  const handleCorrectionAction = async (id: string, status: "approved" | "rejected") => {
    if (!adminName.trim()) { setMessage("管理者名を入力してください。"); return; }
    setProcessingId(id);
    setMessage("");
    const res = await fetch(`/api/correction/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, approverName: adminName.trim(), approverComment: commentMap[id] ?? "" }),
    });
    const data = (await res.json()) as { request?: CorrectionRequest; message?: string };
    if (!res.ok) { setMessage(data.message ?? "操作に失敗しました。"); }
    else if (data.request) { setCorrections((prev) => prev.map((r) => (r.id === id ? data.request! : r))); }
    setProcessingId(null);
  };

  const handleLeaveAction = async (id: string, status: "approved" | "rejected") => {
    if (!adminName.trim()) { setMessage("管理者名を入力してください。"); return; }
    setProcessingId(id);
    setMessage("");
    const res = await fetch(`/api/leave/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, approverName: adminName.trim(), approverComment: commentMap[id] ?? "" }),
    });
    const data = (await res.json()) as { request?: LeaveRequest; message?: string };
    if (!res.ok) { setMessage(data.message ?? "操作に失敗しました。"); }
    else if (data.request) { setLeaves((prev) => prev.map((r) => (r.id === id ? data.request! : r))); }
    setProcessingId(null);
  };

  const reload = async () => {
    const [r1, r2, r3] = await Promise.all([
      fetch("/api/overtime"),
      fetch("/api/correction"),
      fetch("/api/leave"),
    ]);
    const [d1, d2, d3] = await Promise.all([
      r1.json() as Promise<{ requests?: OvertimeRequest[] }>,
      r2.json() as Promise<{ requests?: CorrectionRequest[] }>,
      r3.json() as Promise<{ requests?: LeaveRequest[] }>,
    ]);
    if (d1.requests) setRequests(d1.requests);
    if (d2.requests) setCorrections(d2.requests);
    if (d3.requests) setLeaves(d3.requests);
  };

  const handleClose = async () => {
    if (!adminName.trim()) { setMessage("管理者名を入力してください。"); return; }
    setClosing(true);
    const res = await fetch("/api/monthly-closings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: closeTarget, closedBy: adminName.trim() }),
    });
    if (res.ok) {
      const r2 = await fetch("/api/monthly-closings");
      const d = (await r2.json()) as { closings?: MonthlyClosing[] };
      setClosings(d.closings ?? []);
      setMessage(`${closeTarget} を締め済みにしました。`);
    } else {
      setMessage("締め処理に失敗しました。");
    }
    setClosing(false);
  };

  const handleReopen = async (month: string) => {
    const res = await fetch("/api/monthly-closings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    if (res.ok) {
      setClosings((prev) => prev.filter((c) => c.month !== month));
      setMessage(`${month} の締めを解除しました。`);
    }
  };

  const filteredOvertime = filterStatus === "all" ? requests : requests.filter((r) => r.status === filterStatus);
  const filteredCorrections = corrFilterStatus === "all" ? corrections : corrections.filter((r) => r.status === corrFilterStatus);
  const filteredLeaves = leaveFilterStatus === "all" ? leaves : leaves.filter((r) => r.status === leaveFilterStatus);

  const handleExport = () => {
    const params = new URLSearchParams({ month: exportMonth });
    if (exportUser.trim()) params.set("userName", exportUser.trim());
    window.location.href = `/api/attendance/export?${params.toString()}`;
  };

  return (
    <>
      <section className="dashboard-header">
        <div>
          <h1>管理画面</h1>
          <p className="description">申請の承認・却下、月次締め、CSVエクスポートを行います。</p>
        </div>
        <div className="header-right">
          <label className="field field-inline">
            管理者名
            <input type="text" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="管理者名" />
          </label>
          <button className="sub-button" onClick={() => void reload()}>最新に更新</button>
        </div>
      </section>

      {message && <p className="message" style={{ margin: "0 0 1rem" }}>{message}</p>}

      {dashboard?.summary && (
        <section className="summary-grid" style={{ marginBottom: "1rem" }}>
          <article className="summary-card">
            <span className="summary-label">承認待ち</span>
            <strong>{dashboard.summary.pendingTotal}件</strong>
            <span className="summary-sub">
              残業 {dashboard.summary.pendingOvertime} / 休暇 {dashboard.summary.pendingLeave} / 修正 {dashboard.summary.pendingCorrection}
            </span>
          </article>
          <article className={`summary-card ${dashboard.summary.missingClockOuts > 0 ? "summary-card-warn" : ""}`}>
            <span className="summary-label">退勤漏れ</span>
            <strong className={dashboard.summary.missingClockOuts > 0 ? "overtime-warn" : ""}>
              {dashboard.summary.missingClockOuts}件
            </strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">残業閾値超過</span>
            <strong>{dashboard.summary.otExceeding}名</strong>
            <span className="summary-sub">当月集計</span>
          </article>
          <article className="summary-card">
            <span className="summary-label">有給残少（3日未満）</span>
            <strong>{dashboard.summary.lowLeaveBalance}名</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">当月締め</span>
            <strong>{dashboard.summary.isMonthClosed ? "済" : "未"}</strong>
          </article>
        </section>
      )}

      {dashboard?.otTop && dashboard.otTop.length > 0 && (
        <section className="card">
          <h2 className="section-title">当月残業 TOP</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>氏名</th><th>残業時間</th><th>閾値</th></tr></thead>
              <tbody>
                {dashboard.otTop.map((o) => (
                  <tr key={o.user_name}>
                    <td>{o.user_name}</td>
                    <td>{o.overtime_hours} 時間</td>
                    <td>
                      {o.exceeds_threshold
                        ? <span className="status-chip chip-rejected">超過</span>
                        : <span className="status-chip chip-approved">以内</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {missingRecords.length > 0 && (
        <section className="card">
          <h2 className="section-title">
            退勤漏れ一覧
            <span className="badge-warn">{missingRecords.length}件</span>
          </h2>
          <p className="description">出勤打刻のみで退勤打刻がないレコードです。本人に確認・修正申請を促してください。</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>氏名</th><th>勤務日</th><th>出勤時刻</th><th>区分</th></tr></thead>
              <tbody>
                {missingRecords.map((r) => (
                  <tr key={r.id}>
                    <td>{r.user_name}</td><td>{r.work_date}</td>
                    <td>{r.start_time}</td><td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 申請承認タブ */}
      <section className="card">
        <div className="tab-row" style={{ marginBottom: "1rem" }}>
          <button type="button" className={activeTab === "overtime" ? "tab tab-active" : "tab"} onClick={() => setActiveTab("overtime")}>
            残業申請 {requests.filter((r) => r.status === "pending").length > 0 && <span className="badge-warn">{requests.filter((r) => r.status === "pending").length}</span>}
          </button>
          <button type="button" className={activeTab === "leave" ? "tab tab-active" : "tab"} onClick={() => setActiveTab("leave")}>
            休暇申請 {leaves.filter((r) => r.status === "pending").length > 0 && <span className="badge-warn">{leaves.filter((r) => r.status === "pending").length}</span>}
          </button>
          <button type="button" className={activeTab === "correction" ? "tab tab-active" : "tab"} onClick={() => setActiveTab("correction")}>
            修正申請 {corrections.filter((r) => r.status === "pending").length > 0 && <span className="badge-warn">{corrections.filter((r) => r.status === "pending").length}</span>}
          </button>
        </div>

        {activeTab === "overtime" && (
          <>
            <div className="filter-row">
              {(["all", "pending", "approved", "rejected"] as const).map((s) => (
                <button key={s} type="button" className={filterStatus === s ? "tab tab-active" : "tab"} onClick={() => setFilterStatus(s)}>
                  {s === "all" ? "すべて" : statusLabels[s]}
                </button>
              ))}
            </div>
            {filteredOvertime.length === 0 ? (
              <p className="description">該当する申請はありません。</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>申請者</th><th>残業日</th><th>開始</th><th>終了</th><th>理由</th><th>状態</th><th>コメント</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {filteredOvertime.map((r) => (
                      <tr key={r.id}>
                        <td>{r.user_name}</td><td>{r.request_date}</td>
                        <td>{r.planned_start}</td><td>{r.planned_end}</td>
                        <td className="td-reason">{r.reason}</td>
                        <td><span className={`status-chip ${statusClass[r.status]}`}>{statusLabels[r.status]}</span></td>
                        <td>
                          {r.status === "pending" ? (
                            <input type="text" className="comment-input" placeholder="コメント（任意）"
                              value={commentMap[r.id] ?? ""}
                              onChange={(e) => setCommentMap((prev) => ({ ...prev, [r.id]: e.target.value }))} />
                          ) : (r.approver_comment ?? "-")}
                        </td>
                        <td>
                          {r.status === "pending" && (
                            <div className="action-buttons">
                              <button className="approve-button" disabled={processingId === r.id} onClick={() => void handleOvertimeAction(r.id, "approved")}>承認</button>
                              <button className="reject-button" disabled={processingId === r.id} onClick={() => void handleOvertimeAction(r.id, "rejected")}>却下</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === "leave" && (
          <>
            <div className="filter-row">
              {(["all", "pending", "approved", "rejected"] as const).map((s) => (
                <button key={s} type="button" className={leaveFilterStatus === s ? "tab tab-active" : "tab"} onClick={() => setLeaveFilterStatus(s)}>
                  {s === "all" ? "すべて" : statusLabels[s]}
                </button>
              ))}
            </div>
            {filteredLeaves.length === 0 ? (
              <p className="description">該当する申請はありません。</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>申請者</th><th>取得日</th><th>種別</th><th>区分</th><th>日数</th><th>理由</th><th>状態</th><th>コメント</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {filteredLeaves.map((r) => (
                      <tr key={r.id}>
                        <td>{r.user_name}</td><td>{r.leave_date}</td>
                        <td>{leaveCategoryLabels[r.leave_category ?? "paid"]}</td>
                        <td>{leaveTypeLabels[r.leave_type]}</td><td>{r.days}日</td>
                        <td className="td-reason">{r.reason}</td>
                        <td><span className={`status-chip ${statusClass[r.status]}`}>{statusLabels[r.status]}</span></td>
                        <td>
                          {r.status === "pending" ? (
                            <input type="text" className="comment-input" placeholder="コメント（任意）"
                              value={commentMap[r.id] ?? ""}
                              onChange={(e) => setCommentMap((prev) => ({ ...prev, [r.id]: e.target.value }))} />
                          ) : (r.approver_comment ?? "-")}
                        </td>
                        <td>
                          {r.status === "pending" && (
                            <div className="action-buttons">
                              <button className="approve-button" disabled={processingId === r.id} onClick={() => void handleLeaveAction(r.id, "approved")}>承認</button>
                              <button className="reject-button" disabled={processingId === r.id} onClick={() => void handleLeaveAction(r.id, "rejected")}>却下</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === "correction" && (
          <>
            <div className="filter-row">
              {(["all", "pending", "approved", "rejected"] as const).map((s) => (
                <button key={s} type="button" className={corrFilterStatus === s ? "tab tab-active" : "tab"} onClick={() => setCorrFilterStatus(s)}>
                  {s === "all" ? "すべて" : statusLabels[s as OvertimeStatus]}
                </button>
              ))}
            </div>
            {filteredCorrections.length === 0 ? (
              <p className="description">該当する申請はありません。</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>申請者</th><th>対象日</th><th>修正後 出勤</th><th>修正後 退勤</th><th>理由</th><th>状態</th><th>コメント</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {filteredCorrections.map((r) => (
                      <tr key={r.id}>
                        <td>{r.user_name}</td><td>{r.target_date}</td>
                        <td>{r.after_start}</td><td>{r.after_end ?? "-"}</td>
                        <td className="td-reason">{r.reason}</td>
                        <td><span className={`status-chip ${statusClass[r.status]}`}>{statusLabels[r.status]}</span></td>
                        <td>
                          {r.status === "pending" ? (
                            <input type="text" className="comment-input" placeholder="コメント（任意）"
                              value={commentMap[r.id] ?? ""}
                              onChange={(e) => setCommentMap((prev) => ({ ...prev, [r.id]: e.target.value }))} />
                          ) : (r.approver_comment ?? "-")}
                        </td>
                        <td>
                          {r.status === "pending" && (
                            <div className="action-buttons">
                              <button className="approve-button" disabled={processingId === r.id} onClick={() => void handleCorrectionAction(r.id, "approved")}>承認</button>
                              <button className="reject-button" disabled={processingId === r.id} onClick={() => void handleCorrectionAction(r.id, "rejected")}>却下</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">月次締め処理</h2>
        <p className="description">締め済み月の勤怠データは編集・修正申請が不可になります。</p>
        <div className="month-check-row">
          <label className="field field-inline">
            対象月
            <input type="month" value={closeTarget} onChange={(e) => setCloseTarget(e.target.value)} />
          </label>
          <button className="button" onClick={() => void handleClose()}
            disabled={closing || closings.some((c) => c.month === closeTarget)}>
            {closing ? "処理中..." : "この月を締める"}
          </button>
        </div>
        {closings.length > 0 && (
          <div className="table-wrap" style={{ marginTop: "1rem" }}>
            <table>
              <thead><tr><th>締め済み月</th><th>締め担当者</th><th>締め日時</th><th>操作</th></tr></thead>
              <tbody>
                {closings.map((c) => (
                  <tr key={c.month}>
                    <td>{c.month}</td><td>{c.closed_by}</td><td>{c.closed_at}</td>
                    <td><button className="danger-button" onClick={() => void handleReopen(c.month)}>解除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">CSVエクスポート</h2>
        <div className="export-row">
          <label className="field field-inline">
            対象月
            <input type="month" value={exportMonth} onChange={(e) => setExportMonth(e.target.value)} />
          </label>
          <label className="field field-inline">
            氏名（空白で全員）
            <input type="text" value={exportUser} onChange={(e) => setExportUser(e.target.value)} placeholder="全員" />
          </label>
          <button className="sub-button" onClick={handleExport}>CSVダウンロード</button>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">祝日・会社休日</h2>
        <p className="description">国民の祝日シード登録と、会社独自休日の追加ができます。</p>
        <div className="export-row" style={{ marginBottom: "1rem" }}>
          <button
            className="sub-button"
            disabled={holidayBusy}
            onClick={() => {
              setHolidayBusy(true);
              void fetch("/api/holidays", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "seed", actorName: adminName.trim() || "admin" }),
              })
                .then((r) => r.json())
                .then(async (d: { count?: number; message?: string }) => {
                  if (d.message) setMessage(d.message);
                  else setMessage(`祝日を ${d.count ?? 0} 件同期しました。`);
                  const r2 = await fetch("/api/holidays");
                  const d2 = (await r2.json()) as { holidays?: Holiday[] };
                  setHolidays(d2.holidays ?? []);
                })
                .finally(() => setHolidayBusy(false));
            }}
          >
            国民の祝日を同期（2025–2027）
          </button>
        </div>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            setHolidayBusy(true);
            void fetch("/api/holidays", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "upsert",
                holidayDate,
                name: holidayName,
                kind: holidayKind,
                actorName: adminName.trim() || "admin",
              }),
            })
              .then(async (r) => {
                const d = (await r.json()) as { holiday?: Holiday; message?: string };
                if (!r.ok) {
                  setMessage(d.message ?? "追加に失敗しました。");
                  return;
                }
                setHolidays((prev) => {
                  const next = prev.filter((h) => h.holiday_date !== d.holiday!.holiday_date);
                  return [...next, d.holiday!].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
                });
                setHolidayDate("");
                setHolidayName("");
                setMessage("休日を登録しました。");
              })
              .finally(() => setHolidayBusy(false));
          }}
        >
          <label className="field">
            日付
            <input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} required />
          </label>
          <label className="field">
            名称
            <input type="text" value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="創立記念日" required />
          </label>
          <label className="field">
            区分
            <select value={holidayKind} onChange={(e) => setHolidayKind(e.target.value as HolidayKind)}>
              <option value="company">会社休日</option>
              <option value="national">国民の祝日</option>
            </select>
          </label>
          <button className="button" type="submit" disabled={holidayBusy}>追加 / 更新</button>
        </form>
        {holidays.length > 0 && (
          <div className="table-wrap" style={{ marginTop: "1rem" }}>
            <table>
              <thead><tr><th>日付</th><th>名称</th><th>区分</th><th></th></tr></thead>
              <tbody>
                {holidays.slice().reverse().slice(0, 40).map((h) => (
                  <tr key={h.holiday_date}>
                    <td>{h.holiday_date}</td>
                    <td>{h.name}</td>
                    <td>{h.kind === "national" ? "祝日" : "会社"}</td>
                    <td>
                      <button
                        className="danger-button"
                        onClick={() => {
                          void fetch("/api/holidays", {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              holidayDate: h.holiday_date,
                              actorName: adminName.trim() || "admin",
                            }),
                          }).then((r) => {
                            if (r.ok) setHolidays((prev) => prev.filter((x) => x.holiday_date !== h.holiday_date));
                          });
                        }}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">監査ログ（直近）</h2>
        {auditLogs.length === 0 ? (
          <p className="description">ログはまだありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>日時</th><th>操作者</th><th>操作</th><th>対象</th><th>詳細</th></tr></thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{String(log.created_at).replace("T", " ").slice(0, 19)}</td>
                    <td>{log.actor_name}</td>
                    <td>{log.action}</td>
                    <td>{log.entity_type}{log.entity_id ? `:${log.entity_id.slice(0, 8)}` : ""}</td>
                    <td className="td-reason">{log.detail ? JSON.stringify(log.detail) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
