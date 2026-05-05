"use client";

import { useState, useEffect } from "react";
import type { OvertimeRequest, OvertimeStatus } from "@/types/overtime";

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

export function AdminClient({ initialRequests }: AdminClientProps) {
  const [requests, setRequests] = useState<OvertimeRequest[]>(initialRequests);
  const [adminName, setAdminName] = useState("");
  const [filterStatus, setFilterStatus] = useState<OvertimeStatus | "all">("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [commentMap, setCommentMap] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(USER_NAME_KEY) ?? "";
    if (saved) setAdminName(saved);
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

  const filtered =
    filterStatus === "all" ? requests : requests.filter((r) => r.status === filterStatus);

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
