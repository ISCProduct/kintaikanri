"use client";

import { useMemo, useState, useEffect, type FormEvent } from "react";
import type { AttendanceRecord, AttendanceStatus, AttendanceEvent, AttendanceEventType } from "@/types/attendance";
import type { PaidLeaveSummary } from "@/types/rules";
import { AttendanceCalendar } from "@/components/attendance-calendar";

const eventTypeLabels: Record<AttendanceEventType, string> = {
  break_start: "休憩開始",
  break_end: "休憩終了",
  outing_start: "外出",
  outing_return: "外出戻り",
};

function getLocalDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const USER_NAME_KEY = "kintai_user_name";
const USER_NAME_LIST_KEY = "kintai_user_name_list";
const OTHER_VALUE = "__other__";
const STANDARD_WORK_MINUTES = 8 * 60;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function calcWork(start: string, end: string | null): { work: number; overtime: number } {
  if (!end) return { work: 0, overtime: 0 };
  const work = Math.max(0, timeToMinutes(end) - timeToMinutes(start));
  const overtime = Math.max(0, work - STANDARD_WORK_MINUTES);
  return { work, overtime };
}

type AttendanceFormState = {
  workDate: string;
  startTime: string;
  endTime: string;
  status: AttendanceStatus;
  note: string;
};

const initialFormState: AttendanceFormState = {
  workDate: getLocalDateString(),
  startTime: "09:00",
  endTime: "18:00",
  status: "present",
  note: "",
};

const statusLabels: Record<AttendanceStatus, string> = {
  present: "出社",
  remote: "リモート",
  vacation: "休暇",
  holiday: "休日",
};

type AttendanceClientProps = {
  initialRecords: AttendanceRecord[];
};

export function AttendanceClient({ initialRecords }: AttendanceClientProps) {
  const [today, setToday] = useState<string>(getLocalDateString());
  const [form, setForm] = useState<AttendanceFormState>(initialFormState);
  const [userName, setUserName] = useState<string>("");
  const [selectValue, setSelectValue] = useState<string>("");
  const [newNameInput, setNewNameInput] = useState<string>("");
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<string[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>(initialRecords);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"stamp" | "calendar" | "history">("stamp");
  const [showManualForm, setShowManualForm] = useState(false);
  const [leaveBalance, setLeaveBalance] = useState<PaidLeaveSummary | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [todayEvents, setTodayEvents] = useState<AttendanceEvent[]>([]);

  // 認証状態
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  // PIN変更フォーム
  const [showPinChange, setShowPinChange] = useState(false);
  const [pinOld, setPinOld] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinNew2, setPinNew2] = useState("");
  const [pinChangeMsg, setPinChangeMsg] = useState("");

  // ユーザー管理に登録されたユーザー一覧を取得
  useEffect(() => {
    void fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d: { users?: { user_name: string }[] }) => {
        setRegisteredUsers((d.users ?? []).map((u) => u.user_name));
      })
      .catch(() => setRegisteredUsers([]));
  }, []);

  // 初期ロード：localStorage から復元 + sessionStorage で認証確認
  useEffect(() => {
    const saved = localStorage.getItem(USER_NAME_KEY) ?? "";
    const savedList: string[] = JSON.parse(localStorage.getItem(USER_NAME_LIST_KEY) ?? "[]");
    setCustomNames(savedList);
    if (saved) {
      setSelectValue(saved);
      if (sessionStorage.getItem(`kintai_auth_${saved}`) === "1") {
        setUserName(saved);
        setIsAuthenticated(true);
      }
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      setToday(getLocalDateString());
      setCurrentTime(new Date().toTimeString().slice(0, 8));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!userName) { setLeaveBalance(null); return; }
    void fetch(`/api/paid-leave?userName=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((d: { balance?: PaidLeaveSummary }) => setLeaveBalance(d.balance ?? null))
      .catch(() => setLeaveBalance(null));
  }, [userName]);

  const fetchTodayEvents = async (uname: string, date: string) => {
    try {
      const res = await fetch(`/api/attendance/events?userName=${encodeURIComponent(uname)}&workDate=${date}`);
      const d = (await res.json()) as { events?: AttendanceEvent[] };
      setTodayEvents(d.events ?? []);
    } catch {
      setTodayEvents([]);
    }
  };

  useEffect(() => {
    if (!userName) { setTodayEvents([]); return; }
    void fetchTodayEvents(userName, today);
  }, [userName, today]);

  const knownNames = useMemo(() => {
    const fromRecords = records.map((r) => r.user_name).filter(Boolean);
    return Array.from(new Set([...registeredUsers, ...customNames, ...fromRecords])).sort((a, b) =>
      a.localeCompare(b, "ja"),
    );
  }, [records, customNames, registeredUsers]);

  // 名前選択：認証クリア
  const handleSelectChange = (value: string) => {
    if (value === OTHER_VALUE) {
      setSelectValue(OTHER_VALUE);
      setUserName("");
      setIsAuthenticated(false);
      setNewNameInput("");
      setAuthPassword("");
      setAuthError("");
    } else {
      setSelectValue(value);
      setUserName("");
      setIsAuthenticated(false);
      setAuthPassword("");
      setAuthError("");
      // セッション内で認証済みなら即復元
      if (sessionStorage.getItem(`kintai_auth_${value}`) === "1") {
        setUserName(value);
        setIsAuthenticated(true);
      }
    }
  };

  const handleCustomNameCommit = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updated = Array.from(new Set([...customNames, trimmed]));
    setCustomNames(updated);
    localStorage.setItem(USER_NAME_LIST_KEY, JSON.stringify(updated));
    localStorage.setItem(USER_NAME_KEY, trimmed);
    setSelectValue(trimmed);
    setNewNameInput("");
    setIsAuthenticated(false);
    setAuthPassword("");
    setAuthError("");
  };

  // ログイン / 初回登録
  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!authPassword || !selectValue || selectValue === OTHER_VALUE) return;
    setIsAuthSubmitting(true);
    setAuthError("");
    try {
      const res = await fetch("/api/auth/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: selectValue, pin: authPassword }),
      });
      const d = (await res.json()) as { ok?: boolean; firstTime?: boolean; isManager?: boolean; message?: string };
      if (!res.ok || !d.ok) {
        setAuthError(d.message ?? "認証に失敗しました。");
      } else {
        sessionStorage.setItem(`kintai_auth_${selectValue}`, "1");
        if (d.isManager) sessionStorage.setItem("kintai_manager_authed", "1");
        localStorage.setItem(USER_NAME_KEY, selectValue);
        setIsAuthenticated(true);
        setUserName(selectValue);
        setAuthPassword("");
      }
    } catch {
      setAuthError("通信エラーが発生しました。");
    }
    setIsAuthSubmitting(false);
  };

  const handleLogout = () => {
    if (selectValue && selectValue !== OTHER_VALUE) {
      sessionStorage.removeItem(`kintai_auth_${selectValue}`);
      sessionStorage.removeItem("kintai_manager_authed");
    }
    setIsAuthenticated(false);
    setUserName("");
    setSelectValue("");
    setAuthPassword("");
    setAuthError("");
    setShowPinChange(false);
  };

  const handlePinChange = async (e: FormEvent) => {
    e.preventDefault();
    if (pinNew !== pinNew2) { setPinChangeMsg("新しいPINが一致しません。"); return; }
    if (pinNew.length < 4) { setPinChangeMsg("PINは4桁以上にしてください。"); return; }
    setPinChangeMsg("");
    const res = await fetch("/api/auth/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, pin: pinOld, newPin: pinNew }),
    });
    const d = (await res.json()) as { ok?: boolean; message?: string };
    if (!res.ok || !d.ok) {
      setPinChangeMsg(d.message ?? "変更に失敗しました。");
    } else {
      setPinChangeMsg("PINを変更しました。");
      setPinOld(""); setPinNew(""); setPinNew2("");
      setTimeout(() => { setShowPinChange(false); setPinChangeMsg(""); }, 1500);
    }
  };

  const statusOptions = useMemo(
    () => Object.entries(statusLabels).map(([value, label]) => ({ value: value as AttendanceStatus, label })),
    [],
  );

  const todayRecord = records.find((record) => record.work_date === today) ?? null;
  const lastBreakEvent = [...todayEvents].reverse().find((e) => e.event_type === "break_start" || e.event_type === "break_end");
  const hasActiveBreak = lastBreakEvent?.event_type === "break_start";
  const lastOutingEvent = [...todayEvents].reverse().find((e) => e.event_type === "outing_start" || e.event_type === "outing_return");
  const hasActiveOuting = lastOutingEvent?.event_type === "outing_start";
  const isClockOut = !!todayRecord?.end_time;

  const missingClockOuts = records.filter(
    (r) => !r.end_time && r.work_date < today && ["present", "remote"].includes(r.status),
  );
  const monthPrefix = today.slice(0, 7);
  const monthlyRecords = records.filter((r) => r.work_date.startsWith(monthPrefix));
  const monthlyCount = monthlyRecords.length;
  const remoteDays = monthlyRecords.filter((r) => r.status === "remote").length;
  const monthlyWorkMinutes = monthlyRecords.reduce((sum, r) => sum + calcWork(r.start_time, r.end_time).work, 0);
  const monthlyOvertimeMinutes = monthlyRecords.reduce((sum, r) => sum + calcWork(r.start_time, r.end_time).overtime, 0);

  const postAttendance = async (body: Record<string, unknown>): Promise<AttendanceRecord | null> => {
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as { record?: AttendanceRecord; message?: string };
    if (!response.ok) {
      setMessage(data.message ?? "保存に失敗しました。");
      return null;
    }
    return data.record ?? null;
  };

  const upsertRecord = (record: AttendanceRecord) => {
    setRecords((current) => {
      const exists = current.some((r) => r.id === record.id);
      if (exists) return current.map((r) => (r.id === record.id ? record : r));
      return [record, ...current];
    });
  };

  const submitAttendance = async (payload: AttendanceFormState) => {
    if (!userName.trim()) { setMessage("氏名を選択または入力してください。"); return; }
    setIsSubmitting(true);
    setMessage("");
    const record = await postAttendance({
      action: "manual",
      userName: userName.trim(),
      workDate: payload.workDate,
      startTime: payload.startTime,
      endTime: payload.endTime || undefined,
      status: payload.status,
      note: payload.note,
    });
    if (record) {
      upsertRecord(record);
      setMessage("勤怠データを保存しました。");
      setForm((current) => ({ ...current, note: "" }));
    }
    setIsSubmitting(false);
  };

  const reloadRecords = async () => {
    setIsRefreshing(true);
    setMessage("");
    const response = await fetch("/api/attendance", { method: "GET" });
    const data = (await response.json()) as { records?: AttendanceRecord[]; message?: string };
    if (!response.ok) {
      setMessage(data.message ?? "データの取得に失敗しました。");
    } else {
      setRecords(data.records ?? []);
    }
    setIsRefreshing(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitAttendance(form);
  };

  const handleClockIn = async () => {
    if (!userName.trim()) { setMessage("氏名を選択または入力してください。"); return; }
    setIsSubmitting(true);
    setMessage("");
    const now = new Date();
    const record = await postAttendance({
      action: "clockin",
      userName: userName.trim(),
      workDate: getLocalDateString(),
      startTime: now.toTimeString().slice(0, 5),
      status: "present",
      note: "出勤打刻",
    });
    if (record) { upsertRecord(record); setMessage("出勤を記録しました。"); }
    setIsSubmitting(false);
  };

  const handleClockOut = async () => {
    if (!userName.trim()) { setMessage("氏名を選択または入力してください。"); return; }
    setIsSubmitting(true);
    setMessage("");
    const now = new Date();
    const record = await postAttendance({
      action: "clockout",
      userName: userName.trim(),
      workDate: getLocalDateString(),
      endTime: now.toTimeString().slice(0, 5),
    });
    if (record) { upsertRecord(record); setMessage("退勤を記録しました。"); }
    setIsSubmitting(false);
  };

  const postEvent = async (eventType: AttendanceEventType) => {
    if (!userName.trim()) { setMessage("氏名を選択または入力してください。"); return; }
    setIsSubmitting(true);
    setMessage("");
    const now = new Date();
    const res = await fetch("/api/attendance/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userName: userName.trim(),
        workDate: getLocalDateString(),
        eventType,
        eventTime: now.toTimeString().slice(0, 5),
      }),
    });
    const d = (await res.json()) as { event?: AttendanceEvent; message?: string };
    if (!res.ok) {
      setMessage(d.message ?? "記録に失敗しました。");
    } else if (d.event) {
      setTodayEvents((prev) => [...prev, d.event!]);
      setMessage(`${eventTypeLabels[eventType]}を記録しました。`);
    }
    setIsSubmitting(false);
  };

  const handleOvertimeStart = async () => {
    if (!userName.trim()) { setMessage("氏名を選択または入力してください。"); return; }
    setIsSubmitting(true);
    setMessage("");
    const now = new Date();
    const record = await postAttendance({
      action: "overtime_start",
      userName: userName.trim(),
      workDate: getLocalDateString(),
      overtimeStart: now.toTimeString().slice(0, 5),
    });
    if (record) { upsertRecord(record); setMessage("残業開始を記録しました。"); }
    setIsSubmitting(false);
  };

  // ── 認証前パネル ──────────────────────────────────────────────────────────
  const needsAuth = selectValue && selectValue !== OTHER_VALUE && !isAuthenticated;

  return (
    <>
      {/* ヘッダー */}
      <section className="dashboard-header">
        <div>
          <h1>勤怠管理</h1>
          <p className="description">日次の打刻と月次の勤怠をこの画面で管理します。</p>
        </div>
        <div className="header-right">
          {!isAuthenticated ? (
            <label className="field field-inline">
              氏名
              <select
                value={selectValue}
                onChange={(event) => handleSelectChange(event.target.value)}
              >
                <option value="" disabled>選択してください</option>
                {knownNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                <option value={OTHER_VALUE}>＋ 新しい名前を追加</option>
              </select>
            </label>
          ) : (
            <span className="user-badge">{userName}</span>
          )}
          {selectValue === OTHER_VALUE && !isAuthenticated && (
            <input
              type="text"
              className="name-input"
              value={newNameInput}
              onChange={(e) => setNewNameInput(e.target.value)}
              onBlur={(e) => handleCustomNameCommit(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCustomNameCommit(newNameInput); }}
              placeholder="山田 太郎"
              autoFocus
            />
          )}
          {isAuthenticated && (
            <>
              <button className="sub-button" onClick={() => void reloadRecords()}>
                {isRefreshing ? "更新中..." : "最新に更新"}
              </button>
              <button className="sub-button" onClick={handleLogout}>
                ログアウト
              </button>
            </>
          )}
        </div>
      </section>

      {/* 認証フォーム */}
      {needsAuth && (
        <section className="card" style={{ maxWidth: 360, margin: "0 auto" }}>
          <p className="section-title">{selectValue} のPINを入力</p>
          <p className="description" style={{ fontSize: "0.85rem" }}>
            PINが未登録の場合は管理者に発行を依頼してください。
          </p>
          <form onSubmit={handleAuthSubmit} className="form-grid">
            <label className="field field-full">
              PIN
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value.replace(/\D/g, ""))}
                placeholder="0000"
                autoFocus
                style={{ textAlign: "center", fontSize: "1.2rem", letterSpacing: "0.4em" }}
              />
            </label>
            {authError && <p className="message message-error field-full">{authError}</p>}
            <button className="button" type="submit" disabled={isAuthSubmitting || authPassword.length < 4}>
              {isAuthSubmitting ? "確認中..." : "ログイン"}
            </button>
          </form>
        </section>
      )}

      {/* メインコンテンツ（認証後のみ表示） */}
      {isAuthenticated && (
        <>
          {/* PIN変更 */}
          {showPinChange && (
            <section className="card" style={{ maxWidth: 360, margin: "0 auto" }}>
              <p className="section-title">PIN変更</p>
              <form onSubmit={handlePinChange} className="form-grid">
                <label className="field field-full">
                  現在のPIN
                  <input type="text" inputMode="numeric" maxLength={8} value={pinOld} onChange={(e) => setPinOld(e.target.value.replace(/\D/g, ""))} style={{ textAlign: "center", letterSpacing: "0.3em" }} />
                </label>
                <label className="field field-full">
                  新しいPIN
                  <input type="text" inputMode="numeric" maxLength={8} value={pinNew} onChange={(e) => setPinNew(e.target.value.replace(/\D/g, ""))} style={{ textAlign: "center", letterSpacing: "0.3em" }} />
                </label>
                <label className="field field-full">
                  新しいPIN（確認）
                  <input type="text" inputMode="numeric" maxLength={8} value={pinNew2} onChange={(e) => setPinNew2(e.target.value.replace(/\D/g, ""))} style={{ textAlign: "center", letterSpacing: "0.3em" }} />
                </label>
                {pinChangeMsg && (
                  <p className={`message field-full ${pinChangeMsg.includes("変更しました") ? "" : "message-error"}`}>
                    {pinChangeMsg}
                  </p>
                )}
                <button className="button ghost-button" type="submit" disabled={!pinOld || pinNew.length < 4 || !pinNew2}>
                  変更する
                </button>
                <button className="button ghost-button" type="button" onClick={() => setShowPinChange(false)} style={{ gridColumn: "auto" }}>
                  キャンセル
                </button>
              </form>
            </section>
          )}

          <section className="summary-grid">
            <article className="summary-card">
              <span className="summary-label">本日の勤務状態</span>
              <strong>{todayRecord ? statusLabels[todayRecord.status] : "未打刻"}</strong>
              {todayRecord?.start_time && (
                <span className="summary-sub">
                  {todayRecord.start_time} 〜 {todayRecord.end_time ?? "打刻中"}
                  {todayRecord.end_time && (
                    <> （{formatMinutes(calcWork(todayRecord.start_time, todayRecord.end_time).work)}）</>
                  )}
                </span>
              )}
              {todayRecord?.overtime_start && (
                <span className="summary-sub" style={{ color: "#c2410c" }}>
                  残業開始: {todayRecord.overtime_start}
                </span>
              )}
            </article>
            <article className="summary-card">
              <span className="summary-label">当月の打刻日数</span>
              <strong>{monthlyCount}日</strong>
            </article>
            <article className="summary-card">
              <span className="summary-label">当月の総勤務時間</span>
              <strong>{formatMinutes(monthlyWorkMinutes)}</strong>
            </article>
            <article className="summary-card">
              <span className="summary-label">当月の残業時間</span>
              <strong className={monthlyOvertimeMinutes > 0 ? "overtime-warn" : ""}>
                {formatMinutes(monthlyOvertimeMinutes)}
              </strong>
            </article>
            <article className="summary-card">
              <span className="summary-label">当月のリモート勤務</span>
              <strong>{remoteDays}日</strong>
            </article>
            {missingClockOuts.length > 0 && (
              <article className="summary-card summary-card-warn">
                <span className="summary-label">退勤漏れ</span>
                <strong className="overtime-warn">{missingClockOuts.length}件</strong>
                <span className="summary-sub">最新: {missingClockOuts[0].work_date}</span>
              </article>
            )}
            <article className="summary-card">
              <span className="summary-label">有給残日数</span>
              <strong>{leaveBalance !== null ? `${leaveBalance.remaining}日` : "-"}</strong>
              {leaveBalance && (
                <span className="summary-sub">付与: {leaveBalance.total_granted}日 / 取得: {leaveBalance.total_used}日</span>
              )}
            </article>
          </section>

          <section className="card card-tight">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div className="tab-row">
                <button type="button" className={activeTab === "stamp" ? "tab tab-active" : "tab"} onClick={() => setActiveTab("stamp")}>打刻</button>
                <button type="button" className={activeTab === "calendar" ? "tab tab-active" : "tab"} onClick={() => setActiveTab("calendar")}>カレンダー</button>
                <button type="button" className={activeTab === "history" ? "tab tab-active" : "tab"} onClick={() => setActiveTab("history")}>勤怠履歴</button>
              </div>
              <button
                type="button"
                className="sub-button"
                style={{ fontSize: "0.82rem" }}
                onClick={() => { setShowPinChange((v) => !v); setPinChangeMsg(""); }}
              >
                PIN変更
              </button>
            </div>

            {activeTab === "stamp" ? (
              <div>
                <div className="stamp-panel stamp-panel-main">
                  <p className="stamp-title">本日の打刻</p>
                  <p className="stamp-date">{today}</p>
                  <p className="stamp-clock">{currentTime}</p>

                  {/* 主要打刻ボタン */}
                  <div className="stamp-actions">
                    <button
                      type="button"
                      className="button ghost-button stamp-btn"
                      onClick={() => void handleClockIn()}
                      disabled={isSubmitting || !!todayRecord}
                      title={todayRecord ? "既に出勤済みです" : ""}
                    >
                      出勤
                    </button>
                    <button
                      type="button"
                      className="button ghost-button stamp-btn stamp-btn-overtime"
                      onClick={() => void handleOvertimeStart()}
                      disabled={isSubmitting || !todayRecord || !!todayRecord.overtime_start || isClockOut}
                    >
                      残業開始
                    </button>
                    <button
                      type="button"
                      className="button ghost-button stamp-btn"
                      onClick={() => void handleClockOut()}
                      disabled={isSubmitting || !todayRecord || isClockOut}
                      title={isClockOut ? "既に退勤済みです" : ""}
                    >
                      退勤
                    </button>
                  </div>

                  {/* 休憩・外出ボタン */}
                  <div className="stamp-actions-sub">
                    {!hasActiveBreak ? (
                      <button
                        type="button"
                        className="button ghost-button stamp-btn-sub"
                        onClick={() => void postEvent("break_start")}
                        disabled={isSubmitting || !todayRecord || isClockOut}
                      >
                        休憩開始
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button stamp-btn-sub stamp-btn-break-end"
                        onClick={() => void postEvent("break_end")}
                        disabled={isSubmitting}
                      >
                        休憩終了
                      </button>
                    )}
                    {!hasActiveOuting ? (
                      <button
                        type="button"
                        className="button ghost-button stamp-btn-sub"
                        onClick={() => void postEvent("outing_start")}
                        disabled={isSubmitting || !todayRecord || isClockOut}
                      >
                        外出
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button stamp-btn-sub stamp-btn-outing-return"
                        onClick={() => void postEvent("outing_return")}
                        disabled={isSubmitting}
                      >
                        外出戻り
                      </button>
                    )}
                  </div>

                  {/* 本日のタイムライン */}
                  {todayRecord && (
                    <div className="stamp-timeline">
                      {[
                        { time: todayRecord.start_time.slice(0, 5), label: "出勤", color: "#1e40af" },
                        ...todayEvents.map((e) => ({ time: e.event_time.slice(0, 5), label: eventTypeLabels[e.event_type], color: undefined })),
                        ...(todayRecord.overtime_start ? [{ time: todayRecord.overtime_start.slice(0, 5), label: "残業開始", color: "#c2410c" }] : []),
                        ...(todayRecord.end_time ? [{ time: todayRecord.end_time.slice(0, 5), label: "退勤", color: "#1e40af" }] : []),
                      ]
                        .sort((a, b) => a.time.localeCompare(b.time))
                        .map((item, i) => (
                          <span key={i} className="stamp-timeline-item" style={item.color ? { color: item.color } : undefined}>
                            {item.time} {item.label}
                          </span>
                        ))}
                    </div>
                  )}
                </div>

                <div className="manual-form-toggle">
                  <button type="button" className="sub-button" onClick={() => setShowManualForm((v) => !v)}>
                    {showManualForm ? "▲ 手入力を閉じる" : "▼ 手入力で修正・休暇登録"}
                  </button>
                </div>

                {showManualForm && (
                  <form className="form-grid manual-form" onSubmit={handleSubmit}>
                    <label className="field">
                      勤務日
                      <input type="date" value={form.workDate} onChange={(e) => setForm((c) => ({ ...c, workDate: e.target.value }))} required />
                    </label>
                    <label className="field">
                      開始時刻
                      <input type="time" value={form.startTime} onChange={(e) => setForm((c) => ({ ...c, startTime: e.target.value }))} required />
                    </label>
                    <label className="field">
                      終了時刻
                      <input type="time" value={form.endTime} onChange={(e) => setForm((c) => ({ ...c, endTime: e.target.value }))} />
                    </label>
                    <label className="field">
                      勤務区分
                      <select value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value as AttendanceStatus }))}>
                        {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    <label className="field field-full">
                      備考
                      <textarea value={form.note} onChange={(e) => setForm((c) => ({ ...c, note: e.target.value }))} rows={3} />
                    </label>
                    <button className="button" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "保存中..." : "手入力で保存"}
                    </button>
                  </form>
                )}
              </div>
            ) : activeTab === "calendar" ? (
              <AttendanceCalendar userName={userName} />
            ) : records.length === 0 ? (
              <p className="description">まだデータがありません。</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>勤務日</th>
                      <th>開始</th>
                      <th>終了</th>
                      <th>残業開始</th>
                      <th>勤務時間</th>
                      <th>残業時間</th>
                      <th>区分</th>
                      <th>備考</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.filter((r) => r.user_name === userName).map((record) => {
                      const { work, overtime } = calcWork(record.start_time, record.end_time);
                      return (
                        <tr key={record.id}>
                          <td>{record.work_date}</td>
                          <td>{record.start_time}</td>
                          <td>{record.end_time ?? "-"}</td>
                          <td>{record.overtime_start ?? "-"}</td>
                          <td>{record.end_time ? formatMinutes(work) : "-"}</td>
                          <td className={overtime > 0 ? "overtime-warn" : ""}>{record.end_time ? formatMinutes(overtime) : "-"}</td>
                          <td><span className="status-chip">{statusLabels[record.status]}</span></td>
                          <td>{record.note ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {message ? <p className="message">{message}</p> : null}
          </section>
        </>
      )}
    </>
  );
}
