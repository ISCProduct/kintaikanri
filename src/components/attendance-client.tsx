"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { AttendanceRecord, AttendanceStatus } from "@/types/attendance";

type AttendanceFormState = {
  workDate: string;
  startTime: string;
  endTime: string;
  status: AttendanceStatus;
  note: string;
};

const initialFormState: AttendanceFormState = {
  workDate: new Date().toISOString().slice(0, 10),
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
  const [form, setForm] = useState<AttendanceFormState>(initialFormState);
  const [records, setRecords] = useState<AttendanceRecord[]>(initialRecords);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"stamp" | "history">("stamp");

  const statusOptions = useMemo(
    () =>
      Object.entries(statusLabels).map(([value, label]) => ({
        value: value as AttendanceStatus,
        label,
      })),
    [],
  );

  const today = new Date().toISOString().slice(0, 10);
  const todayRecord = records.find((record) => record.work_date === today) ?? null;
  const monthPrefix = today.slice(0, 7);
  const monthlyCount = records.filter((record) =>
    record.work_date.startsWith(monthPrefix),
  ).length;
  const remoteDays = records.filter(
    (record) => record.status === "remote" && record.work_date.startsWith(monthPrefix),
  ).length;

  const submitAttendance = async (payload: AttendanceFormState) => {
    setIsSubmitting(true);
    setMessage("");

    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as {
      record?: AttendanceRecord;
      message?: string;
    };

    if (!response.ok) {
      setMessage(data.message ?? "保存に失敗しました。");
      setIsSubmitting(false);
      return;
    }

    const created = data.record;
    if (created) {
      setRecords((current) => [created, ...current]);
    }
    setMessage("勤怠データを保存しました。");
    setForm((current) => ({ ...current, note: "" }));
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
    const now = new Date();
    const currentDate = now.toISOString().slice(0, 10);
    const currentTime = now.toTimeString().slice(0, 5);
    const payload: AttendanceFormState = {
      ...form,
      workDate: currentDate,
      startTime: currentTime,
      endTime: "",
      status: "present",
      note: "出勤打刻",
    };
    setForm(payload);
    await submitAttendance(payload);
  };

  const handleClockOut = async () => {
    const now = new Date();
    const currentDate = now.toISOString().slice(0, 10);
    const currentTime = now.toTimeString().slice(0, 5);
    const payload: AttendanceFormState = {
      ...form,
      workDate: currentDate,
      endTime: currentTime,
      note: "退勤打刻",
    };
    setForm(payload);
    await submitAttendance(payload);
  };

  return (
    <>
      <section className="dashboard-header">
        <div>
          <h1>勤怠管理</h1>
          <p className="description">日次の打刻と月次の勤怠をこの画面で管理します。</p>
        </div>
        <button className="sub-button" onClick={() => void reloadRecords()}>
          {isRefreshing ? "更新中..." : "最新に更新"}
        </button>
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
