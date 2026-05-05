"use client";

import { useState, useEffect } from "react";
import type { OvertimeRequest, OvertimeStatus } from "@/types/overtime";
import type { AttendanceRecord } from "@/types/attendance";
import type { MonthlyClosing } from "@/server/closing-service";

const USER_NAME_KEY = "kintai_user_name";

const statusLabels: Record<OvertimeStatus, string> = {
  pending: "申請中",
  approved: "承認済",
  rejected: "却下",
};

const statusClass: Record<OvertimeStatus, string> = {
  pending: "chip-pending",
  approved: "chip-approved",
  rejected: "chip-rejected",
};

type AdminClientProps = {
  initialRequests: OvertimeRequest[];
};

function getThisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function AdminClient({ initialRequests }: AdminClientProps) {
  const [requests, setRequests] = useState<OvertimeRequest[]>(initialRequests);
  const [adminName, setAdminName] = useState("");
  const [filterStatus, setFilterStatus] = useState<OvertimeStatus | "all">("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [commentMap, setCommentMap] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [exportMonth, setExportMonth] = useState(getThisMonth());
  const [exportUser, setExportUser] = useState("");
  const [missingRecords, setMissingRecords] = useState<AttendanceRecord[]>([]);
  const [closings, setClosings] = useState<MonthlyClosing[]>([]);
  const [closeTarget, setCloseTarget] = useState(getThisMonth());
  const [closing, setClosing] = useState(false);

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
  }, []);

  const handleAction = async (id: string, status: "approved" | "rejected") => {
    if (!adminName.trim()) {
      setMessage("管理者名を入力してください。");
      return;
    }
    setProcessingId(id);
    setMessage("");

    const res = await fetch(`/api/overtime/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        approverName: adminName.trim(),
        approverComment: commentMap[id] ?? "",
      }),
    });

    const data = (await res.json()) as { request?: OvertimeRequest; message?: string };

    if (!res.ok) {
      setMessage(data.message ?? "操作に失敗しました。");
      setProcessingId(null);
      return;
    }

    if (data.request) {
      setRequests((prev) => prev.map((r) => (r.id === id ? data.request! : r)));
    }
    setProcessingId(null);
  };

  const reload = async () => {
    const res = await fetch("/api/overtime");
    const data = (await res.json()) as { requests?: OvertimeRequest[] };
    if (data.requests) setRequests(data.requests);
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

  const filtered =
    filterStatus === "all" ? requests : requests.filter((r) => r.status === filterStatus);

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
          <p className="description">残業申請の承認・却下を行います。</p>
        </div>
        <div className="header-right">
          <label className="field field-inline">
            管理者名
            <input
              type="text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="管理者名"
            />
          </label>
          <button className="sub-button" onClick={() => void reload()}>
            最新に更新
          </button>
        </div>
      </section>

      {missingRecords.length > 0 && (
        <section className="card">
          <h2 className="section-title">
            退勤漏れ一覧
            <span className="badge-warn">{missingRecords.length}件</span>
          </h2>
          <p className="description">出勤打刻のみで退勤打刻がないレコードです。本人に確認・修正申請を促してください。</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>勤務日</th>
                  <th>出勤時刻</th>
                  <th>区分</th>
                </tr>
              </thead>
              <tbody>
                {missingRecords.map((r) => (
                  <tr key={r.id}>
                    <td>{r.user_name}</td>
                    <td>{r.work_date}</td>
                    <td>{r.start_time}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="section-title">月次締め処理</h2>
        <p className="description">締め済み月の勤怠データは編集・修正申請が不可になります。</p>
        <div className="month-check-row">
          <label className="field field-inline">
            対象月
            <input type="month" value={closeTarget} onChange={(e) => setCloseTarget(e.target.value)} />
          </label>
          <button
            className="button"
            onClick={() => void handleClose()}
            disabled={closing || closings.some((c) => c.month === closeTarget)}
          >
            {closing ? "処理中..." : "この月を締める"}
          </button>
        </div>
        {closings.length > 0 && (
          <div className="table-wrap" style={{ marginTop: "1rem" }}>
            <table>
              <thead>
                <tr><th>締め済み月</th><th>締め担当者</th><th>締め日時</th><th>操作</th></tr>
              </thead>
              <tbody>
                {closings.map((c) => (
                  <tr key={c.month}>
                    <td>{c.month}</td>
                    <td>{c.closed_by}</td>
                    <td>{c.closed_at}</td>
                    <td>
                      <button className="danger-button" onClick={() => void handleReopen(c.month)}>
                        解除
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
        <h2 className="section-title">CSVエクスポート</h2>
        <div className="export-row">
          <label className="field field-inline">
            対象月
            <input type="month" value={exportMonth} onChange={(e) => setExportMonth(e.target.value)} />
          </label>
          <label className="field field-inline">
            氏名（空白で全員）
            <input
              type="text"
              value={exportUser}
              onChange={(e) => setExportUser(e.target.value)}
              placeholder="全員"
            />
          </label>
          <button className="sub-button" onClick={handleExport}>
            CSVダウンロード
          </button>
        </div>
      </section>

      <section className="card">
        <div className="filter-row">
          {(["all", "pending", "approved", "rejected"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={filterStatus === s ? "tab tab-active" : "tab"}
              onClick={() => setFilterStatus(s)}
            >
              {s === "all" ? "すべて" : statusLabels[s]}
            </button>
          ))}
        </div>

        {message && <p className="message message-error">{message}</p>}

        {filtered.length === 0 ? (
          <p className="description">該当する申請はありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>申請者</th>
                  <th>残業日</th>
                  <th>開始</th>
                  <th>終了</th>
                  <th>理由</th>
                  <th>状態</th>
                  <th>コメント</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{r.user_name}</td>
                    <td>{r.request_date}</td>
                    <td>{r.planned_start}</td>
                    <td>{r.planned_end}</td>
                    <td className="td-reason">{r.reason}</td>
                    <td>
                      <span className={`status-chip ${statusClass[r.status]}`}>
                        {statusLabels[r.status]}
                      </span>
                    </td>
                    <td>
                      {r.status === "pending" ? (
                        <input
                          type="text"
                          className="comment-input"
                          placeholder="コメント（任意）"
                          value={commentMap[r.id] ?? ""}
                          onChange={(e) =>
                            setCommentMap((prev) => ({ ...prev, [r.id]: e.target.value }))
                          }
                        />
                      ) : (
                        r.approver_comment ?? "-"
                      )}
                    </td>
                    <td>
                      {r.status === "pending" && (
                        <div className="action-buttons">
                          <button
                            className="approve-button"
                            disabled={processingId === r.id}
                            onClick={() => void handleAction(r.id, "approved")}
                          >
                            承認
                          </button>
                          <button
                            className="reject-button"
                            disabled={processingId === r.id}
                            onClick={() => void handleAction(r.id, "rejected")}
                          >
                            却下
                          </button>
                        </div>
                      )}
                    </td>
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
