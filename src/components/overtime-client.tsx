"use client";

import { useState, useEffect, type FormEvent } from "react";
import type { OvertimeRequest, OvertimeStatus } from "@/types/overtime";
import { calcOvertimeDuration, formatMinutes } from "@/lib/attendance-calc";

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

function getLocalDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type OvertimeClientProps = {
  initialRequests: OvertimeRequest[];
};

export function OvertimeClient({ initialRequests }: OvertimeClientProps) {
  const [requests, setRequests] = useState<OvertimeRequest[]>(initialRequests);
  const [userName, setUserName] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [requestDate, setRequestDate] = useState(getLocalDateString());
  const [plannedStart, setPlannedStart] = useState("18:00");
  const [plannedEnd, setPlannedEnd] = useState("20:00");
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

  const showMessage = (text: string, type: "success" | "error") => {
    setMessage(text);
    setMessageType(type);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userName.trim()) {
      showMessage("氏名をメインページで設定してください。", "error");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    const res = await fetch("/api/overtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userName: userName.trim(),
        requestDate,
        plannedStart,
        plannedEnd,
        reason,
      }),
    });

    const data = (await res.json()) as { request?: OvertimeRequest; message?: string };

    if (!res.ok) {
      showMessage(data.message ?? "申請に失敗しました。", "error");
      setIsSubmitting(false);
      return;
    }

    if (data.request) {
      setRequests((prev) => [data.request!, ...prev]);
    }
    showMessage("残業申請を提出しました。", "success");
    setReason("");
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/overtime/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const myRequests = requests.filter((r) => !userName || r.user_name === userName.trim());

  if (!isAuthenticated) {
    return (
      <>
        <section className="dashboard-header">
          <div>
            <h1>残業申請</h1>
            <p className="description">残業の事前申請を行います。</p>
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
          <h1>残業申請</h1>
          <p className="description">残業の事前申請を行います。</p>
        </div>
        {userName && <span className="user-badge">{userName}</span>}
      </section>

      <section className="card">
        <h2 className="section-title">新規申請</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            残業日
            <input
              type="date"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
              required
            />
          </label>
          <label className="field">
            開始予定
            <input
              type="time"
              value={plannedStart}
              onChange={(e) => setPlannedStart(e.target.value)}
              required
            />
          </label>
          <label className="field">
            終了予定
            <input
              type="time"
              value={plannedEnd}
              onChange={(e) => setPlannedEnd(e.target.value)}
              required
            />
          </label>
          <label className="field field-full">
            残業理由
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="例: ○○案件の納期対応のため"
              required
            />
          </label>
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "申請中..." : "申請する"}
          </button>
        </form>
        {message && (
          <p className={messageType === "error" ? "message message-error" : "message"}>
            {message}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">申請履歴</h2>
        {myRequests.length === 0 ? (
          <p className="description">申請はまだありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>残業日</th>
                  <th>開始</th>
                  <th>終了</th>
                  <th>予定時間</th>
                  <th>理由</th>
                  <th>状態</th>
                  <th>承認者</th>
                  <th>コメント</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {myRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.request_date}</td>
                    <td>{r.planned_start}</td>
                    <td>{r.planned_end}</td>
                    <td>{formatMinutes(calcOvertimeDuration(r.planned_start, r.planned_end))}</td>
                    <td className="td-reason">{r.reason}</td>
                    <td>
                      <span className={`status-chip ${statusClass[r.status]}`}>
                        {statusLabels[r.status]}
                      </span>
                    </td>
                    <td>{r.approver_name ?? "-"}</td>
                    <td>{r.approver_comment ?? "-"}</td>
                    <td>
                      {r.status === "pending" && (
                        <button
                          className="danger-button"
                          onClick={() => void handleDelete(r.id)}
                        >
                          取消
                        </button>
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
