"use client";

import { useState, type FormEvent } from "react";
import type { ChatSession } from "@/types/chat";

type SessionsResponse = {
  sessions?: ChatSession[];
  message?: string;
};

const USER_ID_KEY = "chat_history_user_id";

export function ChatHistoryClient() {
  const [userId, setUserId] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(USER_ID_KEY) ?? "";
  });
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const showMessage = (text: string, type: "success" | "error") => {
    setMessage(text);
    setMessageType(type);
  };

  const fetchSessions = async (targetUserId: string) => {
    try {
      const url = new URL("/api/chat/sessions", window.location.origin);
      url.searchParams.set("userId", targetUserId);
      const response = await fetch(url.toString());
      const data = (await response.json()) as SessionsResponse;
      if (!response.ok) {
        showMessage(data.message ?? "セッションの取得に失敗しました。", "error");
        setSessions([]);
        return;
      }
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      showMessage("セッションを取得しました。", "success");
      localStorage.setItem(USER_ID_KEY, targetUserId);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "通信に失敗しました。", "error");
      setSessions([]);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId.trim()) {
      showMessage("ユーザーIDを入力してください。", "error");
      return;
    }
    setIsLoading(true);
    setMessage("");
    await fetchSessions(userId.trim());
    setIsLoading(false);
  };

  return (
    <>
      <section className="dashboard-header">
        <div>
          <h1>チャット履歴</h1>
          <p className="description">ユーザーIDを指定してチャットセッションを確認します。</p>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">セッション検索</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            ユーザーID
            <input
              type="text"
              inputMode="numeric"
              value={userId}
              onChange={(e) => setUserId(e.target.value.replace(/\D/g, ""))}
              placeholder="例: 123"
            />
          </label>
          <button className="button" type="submit" disabled={isLoading}>
            {isLoading ? "取得中..." : "履歴を取得"}
          </button>
        </form>
        {message && (
          <p className={messageType === "error" ? "message message-error" : "message"}>
            {message}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">セッション一覧</h2>
        {sessions.length === 0 ? (
          <p className="description">セッションはありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>タイトル</th>
                  <th>作成</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>{session.id}</td>
                    <td>{session.title ?? "-"}</td>
                    <td>{session.created_at ?? "-"}</td>
                    <td>{session.updated_at ?? "-"}</td>
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
