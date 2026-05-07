"use client";

import { useState, useEffect, type FormEvent } from "react";
import type { CorrectionRequest, CorrectionStatus } from "@/types/correction";
import type { AttendanceRecord } from "@/types/attendance";

const USER_NAME_KEY = "kintai_user_name";

const statusLabels: Record<CorrectionStatus, string> = {
  pending: "申請中", approved: "承認済", rejected: "却下",
};
const statusClass: Record<CorrectionStatus, string> = {
  pending: "chip-pending", approved: "chip-approved", rejected: "chip-rejected",
};

type Props = { initialRequests: CorrectionRequest[] };

export function CorrectionClient({ initialRequests }: Props) {
  const [requests, setRequests] = useState(initialRequests);
  const [userName, setUserName] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [afterStart, setAfterStart] = useState("");
  const [afterEnd, setAfterEnd] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  useEffect(() => {
    const saved = localStorage.getItem(USER_NAME_KEY) ?? "";
    if (saved) {
      setUserName(saved);
      setIsAuthenticated(sessionStorage.getItem(`kintai_auth_${saved}`) === "1");
    }
  }, []);

  // 認証後に勤怠記録（退勤済みのみ）を取得
  useEffect(() => {
    if (!isAuthenticated || !userName) return;
    void fetch("/api/attendance")
      .then((r) => r.json())
      .then((d: { records?: AttendanceRecord[] }) => {
        const completed = (d.records ?? []).filter(
          (r) => r.user_name === userName && r.end_time,
        );
        setAttendanceRecords(completed);
      })
      .catch(() => setAttendanceRecords([]));
  }, [isAuthenticated, userName]);

  const selectedRecord = attendanceRecords.find((r) => r.id === selectedRecordId) ?? null;

  const handleRecordSelect = (id: string) => {
    setSelectedRecordId(id);
    setAfterStart("");
    setAfterEnd("");
    setMessage("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) { setMessage("氏名をメインページで設定してください。"); setMessageType("error"); return; }
    if (!selectedRecord) { setMessage("修正対象の勤怠記録を選択してください。"); setMessageType("error"); return; }
    setIsSubmitting(true); setMessage("");

    const res = await fetch("/api/correction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userName: userName.trim(),
        targetDate: selectedRecord.work_date,
        beforeStart: selectedRecord.start_time,
        beforeEnd: selectedRecord.end_time,
        afterStart,
        afterEnd: afterEnd || undefined,
        reason,
      }),
    });
    const data = (await res.json()) as { request?: CorrectionRequest; message?: string };
    if (!res.ok) { setMessage(data.message ?? "申請に失敗しました。"); setMessageType("error"); }
    else {
      if (data.request) setRequests((p) => [data.request!, ...p]);
      setMessage("修正申請を提出しました。"); setMessageType("success");
      setSelectedRecordId(""); setAfterStart(""); setAfterEnd(""); setReason("");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/correction/${id}`, { method: "DELETE" });
    if (res.ok) setRequests((p) => p.filter((r) => r.id !== id));
  };

  const myRequests = requests.filter((r) => !userName || r.user_name === userName.trim());

  if (!isAuthenticated) {
    return (
      <>
        <section className="dashboard-header">
          <div>
            <h1>勤怠修正申請</h1>
            <p className="description">打刻ミス・漏れの修正を申請します。承認後に自動反映されます。</p>
          </div>
        </section>
        <section className="card" style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
          <p className="section-title">ログインが必要です</p>
          <p className="description">勤怠画面でPINログインしてからご利用ください。</p>
          <a href="/" className="button" style={{ display: "inline-block", marginTop: "0.5rem", textDecoration: "none" }}>
            勤怠画面へ
          </a>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="dashboard-header">
        <div>
          <h1>勤怠修正申請</h1>
          <p className="description">打刻ミス・漏れの修正を申請します。承認後に自動反映されます。</p>
        </div>
        {userName && <span className="user-badge">{userName}</span>}
      </section>

      <section className="card">
        <h2 className="section-title">新規修正申請</h2>

        {attendanceRecords.length === 0 ? (
          <p className="description">退勤まで記録された勤怠データがありません。</p>
        ) : (
          <form className="form-grid" onSubmit={handleSubmit}>
            {/* 対象レコード選択 */}
            <label className="field field-full">
              修正対象の勤怠日を選択
              <select
                value={selectedRecordId}
                onChange={(e) => handleRecordSelect(e.target.value)}
                required
              >
                <option value="" disabled>日付を選択してください</option>
                {attendanceRecords.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.work_date}（出勤 {r.start_time.slice(0, 5)} 〜 退勤 {r.end_time!.slice(0, 5)}）
                  </option>
                ))}
              </select>
            </label>

            {/* 現在の打刻（選択後に表示） */}
            {selectedRecord && (
              <div className="field field-full" style={{ background: "var(--surface-2, #f8f9fa)", borderRadius: "0.5rem", padding: "0.75rem 1rem", fontSize: "0.9rem" }}>
                <span style={{ fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>現在の打刻</span>
                <span>出勤：{selectedRecord.start_time.slice(0, 5)}　／　退勤：{selectedRecord.end_time!.slice(0, 5)}</span>
              </div>
            )}

            {/* 修正後の時刻 */}
            <label className="field">
              修正後 出勤時刻
              <input
                type="time"
                value={afterStart}
                onChange={(e) => setAfterStart(e.target.value)}
                disabled={!selectedRecord}
                required
              />
            </label>
            <label className="field">
              修正後 退勤時刻
              <input
                type="time"
                value={afterEnd}
                onChange={(e) => setAfterEnd(e.target.value)}
                disabled={!selectedRecord}
              />
            </label>

            <label className="field field-full">
              修正理由
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="例: 出勤打刻を忘れたため"
                disabled={!selectedRecord}
                required
              />
            </label>
            <button className="button" type="submit" disabled={isSubmitting || !selectedRecord}>
              {isSubmitting ? "申請中..." : "申請する"}
            </button>
          </form>
        )}
        {message && <p className={messageType === "error" ? "message message-error" : "message"}>{message}</p>}
      </section>

      <section className="card">
        <h2 className="section-title">申請履歴</h2>
        {myRequests.length === 0 ? <p className="description">申請はまだありません。</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>対象日</th><th>修正後 出勤</th><th>修正後 退勤</th>
                  <th>理由</th><th>状態</th><th>承認者</th><th>コメント</th><th></th>
                </tr>
              </thead>
              <tbody>
                {myRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.target_date}</td>
                    <td>{r.after_start}</td>
                    <td>{r.after_end ?? "-"}</td>
                    <td className="td-reason">{r.reason}</td>
                    <td><span className={`status-chip ${statusClass[r.status]}`}>{statusLabels[r.status]}</span></td>
                    <td>{r.approver_name ?? "-"}</td>
                    <td>{r.approver_comment ?? "-"}</td>
                    <td>
                      {r.status === "pending" && (
                        <button className="danger-button" onClick={() => void handleDelete(r.id)}>取消</button>
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
