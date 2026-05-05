"use client";

import { useState, useEffect, type FormEvent } from "react";
import type { CorrectionRequest, CorrectionStatus } from "@/types/correction";

const USER_NAME_KEY = "kintai_user_name";

const statusLabels: Record<CorrectionStatus, string> = {
  pending: "申請中", approved: "承認済", rejected: "却下",
};
const statusClass: Record<CorrectionStatus, string> = {
  pending: "chip-pending", approved: "chip-approved", rejected: "chip-rejected",
};

function getLocalDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Props = { initialRequests: CorrectionRequest[] };

export function CorrectionClient({ initialRequests }: Props) {
  const [requests, setRequests] = useState(initialRequests);
  const [userName, setUserName] = useState("");
  const [targetDate, setTargetDate] = useState(getLocalDateString());
  const [afterStart, setAfterStart] = useState("");
  const [afterEnd, setAfterEnd] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  useEffect(() => {
    const saved = localStorage.getItem(USER_NAME_KEY) ?? "";
    if (saved) setUserName(saved);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) { setMessage("氏名をメインページで設定してください。"); setMessageType("error"); return; }
    setIsSubmitting(true); setMessage("");

    const res = await fetch("/api/correction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: userName.trim(), targetDate, afterStart, afterEnd: afterEnd || undefined, reason }),
    });
    const data = (await res.json()) as { request?: CorrectionRequest; message?: string };
    if (!res.ok) { setMessage(data.message ?? "申請に失敗しました。"); setMessageType("error"); }
    else {
      if (data.request) setRequests((p) => [data.request!, ...p]);
      setMessage("修正申請を提出しました。"); setMessageType("success");
      setAfterStart(""); setAfterEnd(""); setReason("");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/correction/${id}`, { method: "DELETE" });
    if (res.ok) setRequests((p) => p.filter((r) => r.id !== id));
  };

  const myRequests = requests.filter((r) => !userName || r.user_name === userName.trim());

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
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            対象日
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required />
          </label>
          <div />
          <label className="field">
            修正後 出勤時刻
            <input type="time" value={afterStart} onChange={(e) => setAfterStart(e.target.value)} required />
          </label>
          <label className="field">
            修正後 退勤時刻
            <input type="time" value={afterEnd} onChange={(e) => setAfterEnd(e.target.value)} />
          </label>
          <label className="field field-full">
            修正理由
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              placeholder="例: 出勤打刻を忘れたため" required />
          </label>
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "申請中..." : "申請する"}
          </button>
        </form>
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
