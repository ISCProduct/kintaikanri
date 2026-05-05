"use client";

import { useMemo, useState, useEffect, type FormEvent } from "react";
import type { AttendanceRecord, AttendanceStatus } from "@/types/attendance";

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
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>(initialRecords);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"stamp" | "history">("stamp");

  useEffect(() => {
    const saved = localStorage.getItem(USER_NAME_KEY) ?? "";
    const savedList: string[] = JSON.parse(localStorage.getItem(USER_NAME_LIST_KEY) ?? "[]");
    setCustomNames(savedList);
    if (saved) {
      setUserName(saved);
      setSelectValue(saved);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => setToday(getLocalDateString()), 60_000);
    return () => clearInterval(id);
  }, []);

  const knownNames = useMemo(() => {
    const fromRecords = records.map((r) => r.user_name).filter(Boolean);
    return Array.from(new Set([...customNames, ...fromRecords])).sort((a, b) =>
      a.localeCompare(b, "ja"),
    );
  }, [records, customNames]);

  const handleSelectChange = (value: string) => {
    if (value === OTHER_VALUE) {
      setSelectValue(OTHER_VALUE);
      setUserName("");
    } else {
      setSelectValue(value);
      setUserName(value);
      localStorage.setItem(USER_NAME_KEY, value);
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
  };

  const statusOptions = useMemo(
    () =>
      Object.entries(statusLabels).map(([value, label]) => ({
        value: value as AttendanceStatus,
        label,
      })),
    [],
  );

  const todayRecord = records.find((record) => record.work_date === today) ?? null;
  const monthPrefix = today.slice(0, 7);
  const monthlyCount = records.filter((record) =>
    record.work_date.startsWith(monthPrefix),
  ).length;
  const remoteDays = records.filter(
    (record) => record.status === "remote" && record.work_date.startsWith(monthPrefix),
  ).length;

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
    if (!userName.trim()) {
      setMessage("氏名を選択または入力してください。");
      return;
    }
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
    const data = (await response.json()) as {
      records?: AttendanceRecord[];
      message?: string;
    };

    if (!response.ok) {
      setMessage(data.message ?? "データの取得に失敗しました。");
      setIsRefreshing(false);
      return;
    }

    setRecords(data.records ?? []);
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

  return (
    <>
      <section className="dashboard-header">
        <div>
          <h1>勤怠管理</h1>
          <p className="description">日次の打刻と月次の勤怠をこの画面で管理します。</p>
        </div>
        <div className="header-right">
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
          {selectValue === OTHER_VALUE && (
            <input
              type="text"
              className="name-input"
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
              onBlur={(event) => handleCustomNameCommit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCustomNameCommit(userName);
              }}
              placeholder="山田 太郎"
              autoFocus
            />
          )}
          <button className="sub-button" onClick={() => void reloadRecords()}>
            {isRefreshing ? "更新中..." : "最新に更新"}
          </button>
        </div>
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <span className="summary-label">本日の勤務状態</span>
          <strong>{todayRecord ? statusLabels[todayRecord.status] : "未打刻"}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">当月の打刻日数</span>
          <strong>{monthlyCount}日</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">当月のリモート勤務</span>
          <strong>{remoteDays}日</strong>
        </article>
      </section>

      <section className="card card-tight">
        <div className="tab-row">
          <button
            type="button"
            className={activeTab === "stamp" ? "tab tab-active" : "tab"}
            onClick={() => setActiveTab("stamp")}
          >
            打刻
          </button>
          <button
            type="button"
            className={activeTab === "history" ? "tab tab-active" : "tab"}
            onClick={() => setActiveTab("history")}
          >
            勤怠履歴
          </button>
        </div>

        {activeTab === "stamp" ? (
          <div className="stamp-layout">
            <div className="stamp-panel">
              <p className="stamp-title">本日の打刻</p>
              <p className="stamp-date">{today}</p>
              <div className="stamp-actions">
                <button
                  type="button"
                  className="button ghost-button"
                  onClick={() => void handleClockIn()}
                  disabled={isSubmitting}
                >
                  出勤
                </button>
                <button
                  type="button"
                  className="button ghost-button"
                  onClick={() => void handleClockOut()}
                  disabled={isSubmitting}
                >
                  退勤
                </button>
              </div>
            </div>

            <form className="form-grid" onSubmit={handleSubmit}>
              <label className="field">
                勤務日
                <input
                  type="date"
                  value={form.workDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      workDate: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label className="field">
                開始時刻
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startTime: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label className="field">
                終了時刻
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      endTime: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="field">
                勤務区分
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as AttendanceStatus,
                    }))
                  }
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field field-full">
                備考
                <textarea
                  value={form.note}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  rows={3}
                />
              </label>

              <button className="button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "保存中..." : "手入力で保存"}
              </button>
            </form>
          </div>
        ) : records.length === 0 ? (
          <p className="description">まだデータがありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>勤務日</th>
                  <th>開始</th>
                  <th>終了</th>
                  <th>区分</th>
                  <th>備考</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.user_name}</td>
                    <td>{record.work_date}</td>
                    <td>{record.start_time}</td>
                    <td>{record.end_time ?? "-"}</td>
                    <td>
                      <span className="status-chip">{statusLabels[record.status]}</span>
                    </td>
                    <td>{record.note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {message ? <p className="message">{message}</p> : null}
      </section>
    </>
  );
}
