"use client";

import { Fragment, useMemo, useState, useEffect, useRef, type FormEvent } from "react";
import type { AttendanceRecord, AttendanceStatus, AttendanceEvent, AttendanceEventType } from "@/types/attendance";
import type { PaidLeaveSummary } from "@/types/rules";
import { AttendanceCalendar } from "@/components/attendance-calendar";
import { calcWork, formatMinutes } from "@/lib/attendance-calc";

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

function shiftDate(dateStr: string, deltaDays: number) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const USER_NAME_KEY = "kintai_user_name";
const USER_NAME_LIST_KEY = "kintai_user_name_list";
const OTHER_VALUE = "__other__";

function onlyOwnRecords(list: AttendanceRecord[], name: string) {
  return list.filter((r) => r.user_name === name);
}

type AttendanceFormState = {
  workDate: string;
  startTime: string;
  endTime: string;
  status: AttendanceStatus;
  note: string;
};

type AttendancePatchInput = {
  workDate?: string;
  startTime?: string;
  endTime?: string | null;
  status?: AttendanceStatus;
  note?: string | null;
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
  const [selectedWorkType, setSelectedWorkType] = useState<"present" | "remote">("present");
  const [missingFixId, setMissingFixId] = useState<string>("");
  const [missingFixEndTime, setMissingFixEndTime] = useState<string>("");
  const [isFixingMissing, setIsFixingMissing] = useState<boolean>(false);
  const [historyMonth, setHistoryMonth] = useState<string>(() => getLocalDateString().slice(0, 7));
  const [monthEvents, setMonthEvents] = useState<Record<string, AttendanceEvent[]>>({});
  const [currentMonthEventMap, setCurrentMonthEventMap] = useState<Record<string, AttendanceEvent[]>>({});
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventFormDate, setEventFormDate] = useState<string>(getLocalDateString());
  const [eventFormType, setEventFormType] = useState<AttendanceEventType>("break_start");
  const [eventFormTime, setEventFormTime] = useState<string>("");

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

  // ユーザー切替時の古いレスポンスを破棄するための世代カウンタ
  const recordsFetchGen = useRef(0);
  const historyRecordsFetchGen = useRef(0);
  const todayEventsFetchGen = useRef(0);
  const monthEventsFetchGen = useRef(0);
  const currentMonthEventsFetchGen = useRef(0);
  const leaveFetchGen = useRef(0);

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

  // ログイン後、自分のレコードだけをロード
  useEffect(() => {
    if (!userName) {
      setRecords([]);
      setTodayEvents([]);
      setMonthEvents({});
      setCurrentMonthEventMap({});
      return;
    }
    setRecords([]);
    setTodayEvents([]);
    setMonthEvents({});
    setCurrentMonthEventMap({});
    void reloadRecords(userName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName]);

  useEffect(() => {
    if (!userName) { setLeaveBalance(null); return; }
    const gen = ++leaveFetchGen.current;
    void fetch(`/api/paid-leave?userName=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((d: { balance?: PaidLeaveSummary }) => {
        if (gen !== leaveFetchGen.current) return;
        setLeaveBalance(d.balance ?? null);
      })
      .catch(() => {
        if (gen !== leaveFetchGen.current) return;
        setLeaveBalance(null);
      });
  }, [userName]);

  const groupEvents = (events: AttendanceEvent[]): Record<string, AttendanceEvent[]> => {
    const grouped: Record<string, AttendanceEvent[]> = {};
    for (const evt of events) {
      (grouped[evt.work_date] ??= []).push(evt);
    }
    return grouped;
  };

  const mergeEventIntoMaps = (event: AttendanceEvent) => {
    setTodayEvents((prev) => {
      if (event.work_date !== activeWorkDate) return prev;
      if (prev.some((e) => e.id === event.id)) return prev;
      return [...prev, event];
    });
    setCurrentMonthEventMap((prev) => {
      if (!event.work_date.startsWith(today.slice(0, 7))) return prev;
      const day = prev[event.work_date] ?? [];
      if (day.some((e) => e.id === event.id)) return prev;
      return { ...prev, [event.work_date]: [...day, event] };
    });
    setMonthEvents((prev) => {
      if (!event.work_date.startsWith(historyMonth)) return prev;
      const day = prev[event.work_date] ?? [];
      if (day.some((e) => e.id === event.id)) return prev;
      return { ...prev, [event.work_date]: [...day, event] };
    });
  };

  const fetchTodayEvents = async (uname: string, date: string) => {
    const gen = ++todayEventsFetchGen.current;
    try {
      const res = await fetch(`/api/attendance/events?userName=${encodeURIComponent(uname)}&workDate=${date}`);
      const d = (await res.json()) as { events?: AttendanceEvent[] };
      if (gen !== todayEventsFetchGen.current) return;
      setTodayEvents((d.events ?? []).filter((e) => e.user_name === uname));
    } catch {
      if (gen !== todayEventsFetchGen.current) return;
      setTodayEvents([]);
    }
  };

  const fetchMonthEvents = async (uname: string, month: string) => {
    const gen = ++monthEventsFetchGen.current;
    try {
      const res = await fetch(`/api/attendance/events?userName=${encodeURIComponent(uname)}&month=${encodeURIComponent(month)}`);
      const d = (await res.json()) as { events?: AttendanceEvent[] };
      if (gen !== monthEventsFetchGen.current) return;
      setMonthEvents(groupEvents((d.events ?? []).filter((e) => e.user_name === uname)));
    } catch {
      if (gen !== monthEventsFetchGen.current) return;
      setMonthEvents({});
    }
  };

  const fetchCurrentMonthEvents = async (uname: string, month: string) => {
    const gen = ++currentMonthEventsFetchGen.current;
    try {
      const res = await fetch(`/api/attendance/events?userName=${encodeURIComponent(uname)}&month=${encodeURIComponent(month)}`);
      const d = (await res.json()) as { events?: AttendanceEvent[] };
      if (gen !== currentMonthEventsFetchGen.current) return;
      setCurrentMonthEventMap(groupEvents((d.events ?? []).filter((e) => e.user_name === uname)));
    } catch {
      if (gen !== currentMonthEventsFetchGen.current) return;
      setCurrentMonthEventMap({});
    }
  };

  const yesterday = useMemo(() => shiftDate(today, -1), [today]);
  const activeWorkDate = useMemo(() => {
    if (!userName) return today;
    const openRecords = records
      .filter(
        (r) =>
          r.user_name === userName &&
          !r.end_time &&
          ["present", "remote"].includes(r.status),
      )
      .sort((a, b) => b.work_date.localeCompare(a.work_date));
    const active =
      openRecords.find((r) => r.work_date === today) ??
      openRecords.find((r) => r.work_date === yesterday) ??
      null;
    return active?.work_date ?? today;
  }, [records, userName, today, yesterday]);

  useEffect(() => {
    if (!userName) { setTodayEvents([]); return; }
    void fetchTodayEvents(userName, activeWorkDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName, activeWorkDate]);

  useEffect(() => {
    if (!userName) { setCurrentMonthEventMap({}); return; }
    void fetchCurrentMonthEvents(userName, today.slice(0, 7));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName, today]);

  useEffect(() => {
    if (activeTab !== "history" || !userName) { setMonthEvents({}); return; }
    void fetchMonthEvents(userName, historyMonth);
    // 履歴月の勤怠レコードも月指定で再取得（直近31件だけだと欠ける）
    const gen = ++historyRecordsFetchGen.current;
    void fetch(`/api/attendance?month=${encodeURIComponent(historyMonth)}&userName=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((d: { records?: AttendanceRecord[] }) => {
        if (gen !== historyRecordsFetchGen.current) return;
        const monthOnes = onlyOwnRecords(d.records ?? [], userName);
        setRecords((prev) => {
          const others = prev.filter(
            (r) => r.user_name === userName && !r.work_date.startsWith(historyMonth),
          );
          return [...monthOnes, ...others];
        });
      })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, userName, historyMonth]);

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

  const openRecords = records
    .filter(
      (r) =>
        r.user_name === userName &&
        !r.end_time &&
        ["present", "remote"].includes(r.status),
    )
    .sort((a, b) => b.work_date.localeCompare(a.work_date));
  // 当日の未退勤、または前日からの翌日跨ぎ勤務を「進行中シフト」とする
  const activeShift =
    openRecords.find((r) => r.work_date === today) ??
    openRecords.find((r) => r.work_date === yesterday) ??
    null;
  const todayRecord =
    records.find((record) => record.work_date === today && record.user_name === userName) ??
    activeShift;
  const isOvernightShift = !!activeShift && activeShift.work_date < today;
  const lastBreakEvent = [...todayEvents].reverse().find((e) => e.event_type === "break_start" || e.event_type === "break_end");
  const hasActiveBreak = lastBreakEvent?.event_type === "break_start";
  const lastOutingEvent = [...todayEvents].reverse().find((e) => e.event_type === "outing_start" || e.event_type === "outing_return");
  const hasActiveOuting = lastOutingEvent?.event_type === "outing_start";
  const isClockOut = !!todayRecord?.end_time;

  const missingClockOuts = records.filter(
    (r) =>
      r.user_name === userName &&
      !r.end_time &&
      r.work_date < today &&
      r.id !== activeShift?.id &&
      ["present", "remote"].includes(r.status),
  );
  const selectedMissingRecord = missingClockOuts.find((r) => r.id === missingFixId) ?? null;
  const monthPrefix = today.slice(0, 7);
  const monthlyRecords = records.filter((r) => r.user_name === userName && r.work_date.startsWith(monthPrefix));
  const monthlyCount = monthlyRecords.length;
  const remoteDays = monthlyRecords.filter((r) => r.status === "remote").length;
  const monthlyWorkMinutes = monthlyRecords.reduce((sum, r) => {
    const events = currentMonthEventMap[r.work_date] ?? [];
    return sum + calcWork(r.start_time, r.end_time, events, r.overtime_start).work;
  }, 0);
  const monthlyOvertimeMinutes = monthlyRecords.reduce((sum, r) => {
    const events = currentMonthEventMap[r.work_date] ?? [];
    return sum + calcWork(r.start_time, r.end_time, events, r.overtime_start).overtime;
  }, 0);

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

  const patchAttendanceRecord = async (id: string, input: AttendancePatchInput): Promise<AttendanceRecord | null> => {
    const response = await fetch(`/api/attendance/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await response.json()) as { record?: AttendanceRecord; message?: string };
    if (!response.ok) {
      setMessage(data.message ?? "修正に失敗しました。");
      return null;
    }
    return data.record ?? null;
  };

  const upsertRecord = (record: AttendanceRecord) => {
    if (userName && record.user_name !== userName) return;
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

  const reloadRecords = async (targetUser = userName) => {
    if (!targetUser) return;
    const gen = ++recordsFetchGen.current;
    setIsRefreshing(true);
    setMessage("");
    const response = await fetch(`/api/attendance?userName=${encodeURIComponent(targetUser)}`, { method: "GET" });
    const data = (await response.json()) as { records?: AttendanceRecord[]; message?: string };
    if (gen !== recordsFetchGen.current) return;
    if (!response.ok) {
      setMessage(data.message ?? "データの取得に失敗しました。");
    } else {
      setRecords(onlyOwnRecords(data.records ?? [], targetUser));
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
      status: selectedWorkType,
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
      workDate: activeWorkDate,
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
        workDate: activeWorkDate,
        eventType,
        eventTime: now.toTimeString().slice(0, 5),
      }),
    });
    const d = (await res.json()) as { event?: AttendanceEvent; message?: string };
    if (!res.ok) {
      setMessage(d.message ?? "記録に失敗しました。");
    } else if (d.event) {
      mergeEventIntoMaps(d.event);
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
      workDate: activeWorkDate,
      overtimeStart: now.toTimeString().slice(0, 5),
    });
    if (record) { upsertRecord(record); setMessage("残業開始を記録しました。"); }
    setIsSubmitting(false);
  };

  const handleManualEvent = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userName.trim() || !eventFormDate || !eventFormType || !eventFormTime) return;
    setIsSubmitting(true);
    setMessage("");
    const res = await fetch("/api/attendance/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userName: userName.trim(),
        workDate: eventFormDate,
        eventType: eventFormType,
        eventTime: eventFormTime,
      }),
    });
    const d = (await res.json()) as { event?: AttendanceEvent; message?: string };
    if (!res.ok) {
      setMessage(d.message ?? "記録に失敗しました。");
    } else if (d.event) {
      mergeEventIntoMaps(d.event);
      setMessage(`${eventTypeLabels[eventFormType]}を記録しました。`);
      setEventFormTime("");
    }
    setIsSubmitting(false);
  };

  const historyPrevMonth = useMemo(() => {
    const d = new Date(historyMonth + "-01");
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [historyMonth]);

  const historyNextMonth = useMemo(() => {
    const d = new Date(historyMonth + "-01");
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [historyMonth]);

  const historyRecords = useMemo(
    () => records.filter((r) => r.user_name === userName && r.work_date.startsWith(historyMonth)),
    [records, userName, historyMonth],
  );

  const handleMissingSelect = (id: string) => {
    setMissingFixId(id);
    if (id) setMissingFixEndTime("18:00");
  };

  const handleFixMissingClockOut = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!missingFixId) { setMessage("退勤漏れの対象日を選択してください。"); return; }
    if (!missingFixEndTime) { setMessage("退勤時刻を入力してください。"); return; }
    setIsFixingMissing(true);
    setMessage("");
    const record = await patchAttendanceRecord(missingFixId, { endTime: missingFixEndTime });
    if (record) {
      upsertRecord(record);
      setMessage("退勤漏れを修正しました。");
      setMissingFixId("");
    }
    setIsFixingMissing(false);
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
                  {isOvernightShift ||
                  (todayRecord.end_time &&
                    todayRecord.end_time.slice(0, 5) < todayRecord.start_time.slice(0, 5))
                    ? "（翌日跨ぎ）"
                    : ""}
                  {todayRecord.end_time && (() => {
                    const { work, overtime, breakMinutes } = calcWork(
                      todayRecord.start_time,
                      todayRecord.end_time,
                      todayEvents,
                      todayRecord.overtime_start,
                    );
                    return (
                      <>
                        {" "}（勤務 {formatMinutes(work)}
                        {breakMinutes > 0 ? ` / 休憩等 ${formatMinutes(breakMinutes)}` : ""}
                        {overtime > 0 ? ` / 残業 ${formatMinutes(overtime)}` : ""}）
                      </>
                    );
                  })()}
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

                  {/* 勤務形態選択（未打刻時のみ） */}
                  {!todayRecord && (
                    <div className="work-type-toggle">
                      <button
                        type="button"
                        className={`work-type-btn${selectedWorkType === "present" ? " work-type-btn-active" : ""}`}
                        onClick={() => setSelectedWorkType("present")}
                      >
                        出社
                      </button>
                      <button
                        type="button"
                        className={`work-type-btn${selectedWorkType === "remote" ? " work-type-btn-active" : ""}`}
                        onClick={() => setSelectedWorkType("remote")}
                      >
                        リモート
                      </button>
                    </div>
                  )}

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

                {missingClockOuts.length > 0 && (
                  <div className="stamp-panel">
                    <p className="stamp-title">
                      退勤漏れの修正
                      <span className="badge-warn">{missingClockOuts.length}件</span>
                    </p>
                    <form className="form-grid" onSubmit={handleFixMissingClockOut}>
                      <label className="field field-full">
                        対象日
                        <select value={missingFixId} onChange={(e) => handleMissingSelect(e.target.value)} required>
                          <option value="" disabled>日付を選択してください</option>
                          {missingClockOuts.map((record) => (
                            <option key={record.id} value={record.id}>
                              {record.work_date}（出勤 {record.start_time.slice(0, 5)}）
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedMissingRecord && (
                        <div className="field field-full" style={{ fontSize: "0.85rem", color: "#64748b" }}>
                          出勤 {selectedMissingRecord.start_time.slice(0, 5)} から退勤時刻を入力してください。
                        </div>
                      )}
                      <label className="field">
                        退勤時刻
                        <input
                          type="time"
                          value={missingFixEndTime}
                          onChange={(e) => setMissingFixEndTime(e.target.value)}
                          disabled={!missingFixId}
                          required
                        />
                      </label>
                      <button
                        className="button"
                        type="submit"
                        disabled={isFixingMissing || !missingFixId}
                      >
                        {isFixingMissing ? "修正中..." : "退勤漏れを修正"}
                      </button>
                    </form>
                  </div>
                )}

                <div className="manual-form-toggle">
                  <button type="button" className="sub-button" onClick={() => setShowEventForm((v) => !v)}>
                    {showEventForm ? "▲ 休憩・外出の記録を閉じる" : "▼ 休憩・外出を手動で記録"}
                  </button>
                </div>

                {showEventForm && (
                  <form className="form-grid manual-form" onSubmit={handleManualEvent}>
                    <label className="field">
                      日付
                      <input
                        type="date"
                        value={eventFormDate}
                        onChange={(e) => setEventFormDate(e.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      種別
                      <select value={eventFormType} onChange={(e) => setEventFormType(e.target.value as AttendanceEventType)}>
                        <option value="break_start">休憩開始</option>
                        <option value="break_end">休憩終了</option>
                        <option value="outing_start">外出</option>
                        <option value="outing_return">外出戻り</option>
                      </select>
                    </label>
                    <label className="field">
                      時刻
                      <input
                        type="time"
                        value={eventFormTime}
                        onChange={(e) => setEventFormTime(e.target.value)}
                        required
                      />
                    </label>
                    <button className="button" type="submit" disabled={isSubmitting || !eventFormTime}>
                      {isSubmitting ? "記録中..." : "記録する"}
                    </button>
                  </form>
                )}

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
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", justifyContent: "center", paddingBottom: "0.8rem" }}>
                  <button className="cal-nav-btn" type="button" onClick={() => setHistoryMonth(historyPrevMonth)}>‹</button>
                  <span style={{ fontWeight: 600, fontSize: "1rem" }}>{historyMonth}</span>
                  <button className="cal-nav-btn" type="button" onClick={() => setHistoryMonth(historyNextMonth)}>›</button>
                </div>
                {historyRecords.length === 0 ? (
                  <p className="description">この月のデータはありません。</p>
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
                        {historyRecords.map((record) => {
                          const dayEvents = monthEvents[record.work_date] ?? [];
                          const { work, overtime, breakMinutes } = calcWork(
                            record.start_time,
                            record.end_time,
                            dayEvents,
                            record.overtime_start,
                          );
                          const overnight =
                            !!record.end_time &&
                            record.end_time.slice(0, 5) < record.start_time.slice(0, 5);
                          return (
                            <Fragment key={record.id}>
                              <tr>
                                <td>{record.work_date}{overnight ? "（跨）" : ""}</td>
                                <td>{record.start_time}</td>
                                <td>{record.end_time ?? "-"}</td>
                                <td>{record.overtime_start ?? "-"}</td>
                                <td>
                                  {record.end_time
                                    ? `${formatMinutes(work)}${breakMinutes > 0 ? `（休憩等 ${formatMinutes(breakMinutes)}）` : ""}`
                                    : "-"}
                                </td>
                                <td className={overtime > 0 ? "overtime-warn" : ""}>{record.end_time ? formatMinutes(overtime) : "-"}</td>
                                <td><span className="status-chip">{statusLabels[record.status]}</span></td>
                                <td>{record.note ?? "-"}</td>
                              </tr>
                              {dayEvents.length > 0 && (
                                <tr>
                                  <td colSpan={8} style={{ padding: "0.2rem 0.8rem 0.5rem", background: "#f8fafc" }}>
                                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                                      {dayEvents.map((evt, i) => (
                                        <span
                                          key={i}
                                          style={{
                                            fontSize: "0.78rem",
                                            padding: "0.1rem 0.45rem",
                                            borderRadius: "4px",
                                            background: evt.event_type.startsWith("break") ? "#fef9c3" : "#ecfdf5",
                                            color: evt.event_type.startsWith("break") ? "#92400e" : "#065f46",
                                          }}
                                        >
                                          {evt.event_time.slice(0, 5)} {eventTypeLabels[evt.event_type]}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {message ? <p className="message">{message}</p> : null}
          </section>
        </>
      )}
    </>
  );
}
