"use client";

import { useState, useEffect, type ReactNode } from "react";

const ADMIN_SESSION_KEY = "kintai_admin_authed";

export function AdminGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const v = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (v === "1") setAuthed(true);
    setChecked(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = (await res.json()) as { ok: boolean; message?: string };
    if (data.ok) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
      setAuthed(true);
    } else {
      setError(data.message ?? "認証に失敗しました。");
    }
    setLoading(false);
  };

  if (!checked) return null;

  if (!authed) {
    return (
      <main className="container">
        <section className="card" style={{ maxWidth: 360, margin: "80px auto" }}>
          <h2 className="section-title">管理者認証</h2>
          <p className="description">管理画面にアクセスするにはPINコードが必要です。</p>
          <form className="form-grid" onSubmit={(e) => void handleSubmit(e)}>
            <label className="field field-full">
              PINコード
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="0000"
                autoFocus
                required
              />
            </label>
            <button className="button" type="submit" disabled={loading}>
              {loading ? "確認中..." : "ログイン"}
            </button>
          </form>
          {error && <p className="message message-error">{error}</p>}
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
