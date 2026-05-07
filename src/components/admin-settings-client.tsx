"use client";

import { useState, useEffect } from "react";
import type { SystemRule } from "@/types/rules";
import type { MonthlyOvertimeSummary, PaidLeaveSummary } from "@/types/rules";
import type { UserProfile } from "@/server/user-profile-service";

const ADMIN_SESSION_KEY = "kintai_admin_authed";

function getThisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Props = {
  initialRules: SystemRule[];
  initialSummaries: PaidLeaveSummary[];
};

export function AdminSettingsClient({ initialRules, initialSummaries }: Props) {
  const [rules, setRules] = useState<SystemRule[]>(initialRules.filter((r) => r.key !== "admin_pin"));
  const [summaries, setSummaries] = useState<PaidLeaveSummary[]>(initialSummaries);
  const [overtime, setOvertime] = useState<MonthlyOvertimeSummary[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(getThisMonth());
  const [editValues, setEditValues] = useState<Record<string, string>>(
    Object.fromEntries(initialRules.filter((r) => r.key !== "admin_pin").map((r) => [r.key, r.value])),
  );
  const [saving, setSaving] = useState(false);
  const [granting, setGranting] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [newPin, setNewPin] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState(
    () => initialRules.find((r) => r.key === "discord_webhook_url")?.value ?? "",
  );
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [togglingUser, setTogglingUser] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState("");
  const [newUserPin, setNewUserPin] = useState("");
  const [newUserPin2, setNewUserPin2] = useState("");
  const [newUserMsg, setNewUserMsg] = useState("");
  const [pinResetTarget, setPinResetTarget] = useState<string | null>(null);
  const [pinResetValue, setPinResetValue] = useState("");
  const [pinResetValue2, setPinResetValue2] = useState("");
  const [pinResetMsg, setPinResetMsg] = useState("");
  const [pinResetting, setPinResetting] = useState(false);

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

  const handleSaveWebhook = async () => {
    setWebhookSaving(true);
    const res = await fetch("/api/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "discord_webhook_url", value: webhookUrl.trim() }),
    });
    showMsg(res.ok ? "Webhook URLを保存しました。" : "保存に失敗しました。", res.ok ? "success" : "error");
    setWebhookSaving(false);
  };

  const handleSavePin = async () => {
    if (!newPin.trim()) { showMsg("PINを入力してください。", "error"); return; }
    setPinSaving(true);
    const res = await fetch("/api/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "admin_pin", value: newPin.trim() }),
    });
    if (res.ok) {
      showMsg("PINを変更しました。次回ログインから新しいPINが有効です。");
      setNewPin("");
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } else {
      showMsg("PIN変更に失敗しました。", "error");
    }
    setPinSaving(false);
  };

  useEffect(() => {
    setUsersLoading(true);
    void fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d: { users?: UserProfile[] }) => setUsers(d.users ?? []))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newUserPin !== newUserPin2) { setNewUserMsg("PINが一致しません。"); return; }
    if (newUserPin.length < 4) { setNewUserMsg("PINは4桁以上にしてください。"); return; }
    setNewUserMsg("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: newUserName.trim(), initialPin: newUserPin }),
    });
    const d = (await res.json()) as { ok?: boolean; message?: string };
    if (!res.ok || !d.ok) {
      setNewUserMsg(d.message ?? "作成に失敗しました。");
    } else {
      setNewUserMsg(`「${newUserName.trim()}」を登録しました。`);
      setNewUserName(""); setNewUserPin(""); setNewUserPin2("");
      const r2 = await fetch("/api/admin/users");
      const d2 = (await r2.json()) as { users?: UserProfile[] };
      setUsers(d2.users ?? []);
    }
  };

  const handlePinReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinResetTarget) return;
    if (pinResetValue !== pinResetValue2) { setPinResetMsg("PINが一致しません。"); return; }
    if (pinResetValue.length < 4) { setPinResetMsg("PINは4桁以上にしてください。"); return; }
    setPinResetting(true);
    setPinResetMsg("");
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: pinResetTarget, newPin: pinResetValue }),
    });
    const d = (await res.json()) as { ok?: boolean; message?: string };
    if (!res.ok || !d.ok) {
      setPinResetMsg(d.message ?? "再設定に失敗しました。");
    } else {
      setPinResetMsg("PINを再設定しました。");
      setTimeout(() => {
        setPinResetTarget(null);
        setPinResetValue("");
        setPinResetValue2("");
        setPinResetMsg("");
      }, 1500);
    }
    setPinResetting(false);
  };

  const handleToggleManager = async (userName: string, isManager: boolean) => {
    setTogglingUser(userName);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, isManager }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.user_name === userName ? { ...u, is_manager: isManager } : u));
    } else {
      showMsg("変更に失敗しました。", "error");
    }
    setTogglingUser(null);
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

      {/* 管理者PIN変更 */}
      <section className="card">
        <h2 className="section-title">管理者PINコード変更</h2>
        <p className="description">管理画面へのアクセスに使用するPINコードを変更できます。初期値は <strong>0000</strong> です。</p>
        <div className="month-check-row">
          <label className="field field-inline">
            新しいPIN
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="新しいPINを入力"
              maxLength={20}
            />
          </label>
          <button className="sub-button" onClick={() => void handleSavePin()} disabled={pinSaving}>
            {pinSaving ? "変更中..." : "PINを変更"}
          </button>
        </div>
      </section>

      {/* Discord通知設定 */}
      <section className="card">
        <h2 className="section-title">Discord通知設定</h2>
        <p className="description" style={{ fontSize: "0.85rem" }}>
          出勤・退勤・休憩・外出などの打刻時にDiscordへ通知します。WebhookのURLをDiscordサーバーの設定から取得して貼り付けてください。空欄にすると通知しません。
        </p>
        <div className="month-check-row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: 1 }}>
            Webhook URL
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
            />
          </label>
          <button className="sub-button" onClick={() => void handleSaveWebhook()} disabled={webhookSaving}>
            {webhookSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </section>

      {/* ユーザー管理 */}
      <section className="card">
        <h2 className="section-title">ユーザー管理</h2>
        <p className="description" style={{ fontSize: "0.85rem" }}>
          ユーザーはここで登録した人だけがログインできます。管理職に設定すると管理画面にもアクセスできます。
        </p>

        {/* 新規ユーザー作成 */}
        <form onSubmit={(e) => void handleCreateUser(e)} className="form-grid" style={{ borderBottom: "1px solid var(--line)", paddingBottom: "1rem" }}>
          <p className="section-title field-full" style={{ fontSize: "0.9rem" }}>新規ユーザー登録</p>
          <label className="field">
            氏名
            <input
              type="text"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="山田 太郎"
              required
            />
          </label>
          <label className="field">
            初期PIN
            <input
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={newUserPin}
              onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, ""))}
              placeholder="0000"
              style={{ textAlign: "center", letterSpacing: "0.3em" }}
              required
            />
          </label>
          <label className="field">
            初期PIN（確認）
            <input
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={newUserPin2}
              onChange={(e) => setNewUserPin2(e.target.value.replace(/\D/g, ""))}
              placeholder="0000"
              style={{ textAlign: "center", letterSpacing: "0.3em" }}
              required
            />
          </label>
          <button
            className="button ghost-button"
            type="submit"
            disabled={!newUserName.trim() || newUserPin.length < 4 || !newUserPin2}
            style={{ alignSelf: "flex-end" }}
          >
            登録する
          </button>
          {newUserMsg && (
            <p className={`message field-full ${newUserMsg.includes("登録しました") ? "" : "message-error"}`}>
              {newUserMsg}
            </p>
          )}
        </form>

        {/* ユーザー一覧 */}
        {usersLoading ? (
          <p className="description">読込中...</p>
        ) : users.length === 0 ? (
          <p className="description">登録済みのユーザーがいません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>権限</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <>
                    <tr key={u.user_name}>
                      <td>{u.user_name}</td>
                      <td>
                        {u.is_manager ? (
                          <span className="status-chip chip-approved">管理職</span>
                        ) : (
                          <span className="status-chip">一般</span>
                        )}
                      </td>
                      <td style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button
                          className={u.is_manager ? "reject-button" : "approve-button"}
                          disabled={togglingUser === u.user_name}
                          onClick={() => void handleToggleManager(u.user_name, !u.is_manager)}
                        >
                          {u.is_manager ? "管理職解除" : "管理職に設定"}
                        </button>
                        <button
                          className="sub-button"
                          onClick={() => {
                            setPinResetTarget(pinResetTarget === u.user_name ? null : u.user_name);
                            setPinResetValue("");
                            setPinResetValue2("");
                            setPinResetMsg("");
                          }}
                        >
                          PIN再設定
                        </button>
                      </td>
                    </tr>
                    {pinResetTarget === u.user_name && (
                      <tr key={`${u.user_name}-pin`}>
                        <td colSpan={3}>
                          <form onSubmit={(e) => void handlePinReset(e)} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap", padding: "0.5rem 0" }}>
                            <label className="field field-inline" style={{ margin: 0 }}>
                              新しいPIN
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={8}
                                value={pinResetValue}
                                onChange={(e) => setPinResetValue(e.target.value.replace(/\D/g, ""))}
                                placeholder="0000"
                                style={{ textAlign: "center", letterSpacing: "0.3em", width: "7rem" }}
                                autoFocus
                              />
                            </label>
                            <label className="field field-inline" style={{ margin: 0 }}>
                              確認
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={8}
                                value={pinResetValue2}
                                onChange={(e) => setPinResetValue2(e.target.value.replace(/\D/g, ""))}
                                placeholder="0000"
                                style={{ textAlign: "center", letterSpacing: "0.3em", width: "7rem" }}
                              />
                            </label>
                            <button
                              className="button ghost-button"
                              type="submit"
                              disabled={pinResetting || pinResetValue.length < 4 || !pinResetValue2}
                            >
                              {pinResetting ? "設定中..." : "確定"}
                            </button>
                            <button
                              className="sub-button"
                              type="button"
                              onClick={() => { setPinResetTarget(null); setPinResetMsg(""); }}
                            >
                              キャンセル
                            </button>
                            {pinResetMsg && (
                              <span className={pinResetMsg.includes("再設定しました") ? "message" : "message message-error"} style={{ width: "100%" }}>
                                {pinResetMsg}
                              </span>
                            )}
                          </form>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
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
