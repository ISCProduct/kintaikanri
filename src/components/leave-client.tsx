"use client";

import { useState, useEffect, type FormEvent } from "react";
import type { LeaveCategory, LeaveRequest, LeaveStatus, LeaveType } from "@/types/leave";
import { leaveCategoryLabels, leaveTypeLabels } from "@/types/leave";

const USER_NAME_KEY = "kintai_user_name";

const statusLabels: Record<LeaveStatus, string> = {
  pending: "申請中",
  approved: "承認済",
  rejected: "却下",
};

const statusClass: Record<LeaveStatus, string> = {
  pending: "chip-pending",
  approved: "chip-approved",
  rejected: "chip-rejected",
};

function getLocalDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type LeaveClientProps = {
  initialRequests: LeaveRequest[];
};

export function LeaveClient({ initialRequests }: LeaveClientProps) {
  const [requests, setRequests] = useState<LeaveRequest[]>(initialRequests);
  const [userName, setUserName] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [leaveDate, setLeaveDate] = useState(getLocalDateString());
  const [leaveCategory, setLeaveCategory] = useState<LeaveCategory>("paid");
  const [leaveType, setLeaveType] = useState<LeaveType>("full");
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

  useEffect(() => {
    if (leaveCategory !== "paid" && leaveType !== "full") {
      setLeaveType("full");
    }
  }, [leaveCategory, leaveType]);

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

    const res = await fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userName: userName.trim(),
        leaveDate,
        leaveType: leaveCategory === "paid" ? leaveType : "full",
        leaveCategory,
        reason,
      }),
    });

    const data = (await res.json()) as { request?: LeaveRequest; message?: string };

    if (!res.ok) {
      showMessage(data.message ?? "申請に失敗しました。", "error");
      setIsSubmitting(false);
      return;
    }

    if (data.request) {
      setRequests((prev) => [data.request!, ...prev]);
    }
    showMessage("休暇申請を提出しました。", "success");
    setReason("");
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/leave/${id}`, { method: "DELETE" });
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
            <h1>休暇申請</h1>
            <p className="description">有給・病休・特別休暇などの申請を行います。</p>
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
          <h1>休暇申請</h1>
          <p className="description">
            有給・病休・特別休暇などを申請します。有給は残日数を消費し、不足時は申請できません。
          </p>
        </div>
        {userName && <span className="user-badge">{userName}</span>}
      </section>

      <section className="card">
        <h2 className="section-title">新規申請</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            取得日
            <input
              type="date"
              value={leaveDate}
              onChange={(e) => setLeaveDate(e.target.value)}
              required
            />
          </label>
          <label className="field">
            休暇種別
            <select
              value={leaveCategory}
              onChange={(e) => setLeaveCategory(e.target.value as LeaveCategory)}
              required
            >
              {(Object.keys(leaveCategoryLabels) as LeaveCategory[]).map((c) => (
                <option key={c} value={c}>
                  {leaveCategoryLabels[c]}
                </option>
              ))}
            </select>
          </label>
          {leaveCategory === "paid" && (
            <label className="field">
              時間区分
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                required
              >
                {(Object.keys(leaveTypeLabels) as LeaveType[]).map((t) => (
                  <option key={t} value={t}>
                    {leaveTypeLabels[t]}（{t === "full" ? "1日" : "0.5日"}）
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field field-full">
            申請理由
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="例: 私用のため / 通院のため"
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
                  <th>取得日</th>
                  <th>種別</th>
                  <th>区分</th>
                  <th>日数</th>
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
                    <td>{r.leave_date}</td>
                    <td>{leaveCategoryLabels[r.leave_category ?? "paid"]}</td>
                    <td>{leaveTypeLabels[r.leave_type]}</td>
                    <td>{r.days}日</td>
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
