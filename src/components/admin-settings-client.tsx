"use client";

import { useState } from "react";
import type { SystemRule } from "@/types/rules";
import type { MonthlyOvertimeSummary, PaidLeaveSummary } from "@/types/rules";

function getThisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Props = {
  initialRules: SystemRule[];
  initialSummaries: PaidLeaveSummary[];
};

export function AdminSettingsClient({ initialRules, initialSummaries }: Props) {
  const [rules, setRules] = useState<SystemRule[]>(initialRules);
  const [summaries, setSummaries] = useState<PaidLeaveSummary[]>(initialSummaries);
  const [overtime, setOvertime] = useState<MonthlyOvertimeSummary[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(getThisMonth());
  const [editValues, setEditValues] = useState<Record<string, string>>(
    Object.fromEntries(initialRules.map((r) => [r.key, r.value])),
  );
  const [saving, setSaving] = useState(false);
  const [granting, setGranting] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage(text);
    setMessageType(type);
  };

  const handleSaveRules = async () => {
    setSaving(true);
    setMessage("");
    try {
      await Promise.all(
        rules.map((r) =>
          fetch("/api/rules", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: r.key, value: editValues[r.key] }),
          }),
        ),
      );
      setRules((prev) => prev.map((r) => ({ ...r, value: editValues[r.key] })));
      showMsg("設定を保存しました。");
    } catch {
      showMsg("保存に失敗しました。", "error");
    }
    setSaving(false);
  };

  const handleCheckOvertime = async () => {
    setMessage("");
    const res = await fetch(`/api/paid-leave?month=${selectedMonth}`);
    const data = (await res.json()) as {
      summaries?: PaidLeaveSummary[];
      overtime?: MonthlyOvertimeSummary[];
    };
    setOvertime(data.overtime ?? []);
    setSummaries(data.summaries ?? []);
  };

  const handleGrant = async (userName: string) => {
    setGranting(userName);
    setMessage("");
    const res = await fetch("/api/paid-leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, month: selectedMonth }),
    });
    const data = (await res.json()) as { grantDays?: number; message?: string };
    if (!res.ok) {
      showMsg(data.message ?? "付与に失敗しました。", "error");
    } else {
      showMsg(`${userName} に ${data.grantDays} 日の有給を付与しました。`);
      setOvertime((prev) =>
        prev.map((o) => (o.user_name === userName ? { ...o, already_granted: true } : o)),
      );
      const res2 = await fetch(`/api/paid-leave?month=${selectedMonth}`);
      const d2 = (await res2.json()) as { summaries?: PaidLeaveSummary[] };
      setSummaries(d2.summaries ?? []);
    }
    setGranting(null);
  };

  const handleGrantAll = async () => {
    const targets = overtime.filter((o) => o.exceeds_threshold && !o.already_granted);
    for (const o of targets) {
      await handleGrant(o.user_name);
    }
  };

  const thresholdHours = parseFloat(editValues["overtime_threshold_hours"] ?? "30");

  return (
    <>
      <section className="dashboard-header">
        <div>
          <h1>システム設定</h1>
          <p className="description">有給自動付与ルールと月次残業集計を管理します。</p>
        </div>
      </section>

      {/* ルール設定 */}
      <section className="card">
        <h2 className="section-title">有給自動付与ルール</h2>
        <div className="rules-grid">
          {rules.map((rule) => (
            <label key={rule.key} className="field">
              {rule.label}
              <div className="input-unit-wrap">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editValues[rule.key] ?? rule.value}
                  onChange={(e) =>
                    setEditValues((prev) => ({ ...prev, [rule.key]: e.target.value }))
                  }
                />
                <span className="input-unit">
                  {rule.key === "overtime_threshold_hours" ? "時間" : "日"}
                </span>
              </div>
            </label>
          ))}
        </div>
        <button className="button rules-save-button" onClick={() => void handleSaveRules()} disabled={saving}>
          {saving ? "保存中..." : "設定を保存"}
        </button>
        {message && (
          <p className={messageType === "error" ? "message message-error" : "message"}>{message}</p>
        )}
      </section>

      {/* 月次残業集計 */}
      <section className="card">
        <h2 className="section-title">月次残業集計・有給付与</h2>
        <div className="month-check-row">
          <label className="field field-inline">
            対象月
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </label>
          <button className="sub-button" onClick={() => void handleCheckOvertime()}>
            集計する
          </button>
        </div>

        {overtime.length > 0 && (
          <>
            <p className="rule-desc">
              閾値：月{thresholdHours}時間超過で有給付与
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>氏名</th>
                    <th>残業時間</th>
                    <th>閾値超過</th>
                    <th>付与状況</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {overtime.map((o) => (
                    <tr key={o.user_name}>
                      <td>{o.user_name}</td>
                      <td>{o.overtime_hours} 時間</td>
                      <td>
                        {o.exceeds_threshold ? (
                          <span className="status-chip chip-rejected">超過</span>
                        ) : (
                          <span className="status-chip chip-approved">以内</span>
                        )}
                      </td>
                      <td>
                        {o.already_granted ? (
                          <span className="status-chip chip-approved">付与済</span>
                        ) : (
                          <span className="status-chip chip-pending">未付与</span>
                        )}
                      </td>
                      <td>
                        {o.exceeds_threshold && !o.already_granted && (
                          <button
                            className="approve-button"
                            disabled={granting === o.user_name}
                            onClick={() => void handleGrant(o.user_name)}
                          >
                            有給付与
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {overtime.some((o) => o.exceeds_threshold && !o.already_granted) && (
              <button className="button" onClick={() => void handleGrantAll()}>
                超過者に一括付与
              </button>
            )}
          </>
        )}
      </section>

      {/* 有給残日数一覧 */}
      <section className="card">
        <h2 className="section-title">有給残日数一覧</h2>
        {summaries.length === 0 ? (
          <p className="description">データがありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>付与合計</th>
                  <th>取得合計</th>
                  <th>残日数</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.user_name}>
                    <td>{s.user_name}</td>
                    <td>{s.total_granted} 日</td>
                    <td>{s.total_used} 日</td>
                    <td><strong>{s.remaining} 日</strong></td>
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
