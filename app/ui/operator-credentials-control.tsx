"use client";

import { useState, type FormEvent } from "react";
import { useRead } from "./data";
import { ErrorState, Facts, Loading, Time } from "./primitives";

type OperatorAccount = { username: string; source: "settings" | "environment"; updatedAt: string | null };

const errors: Record<string, string> = {
  current_password_incorrect: "Current password is incorrect.",
  invalid_credentials_request: "New password must be at least 16 characters; the username cannot contain a colon.",
};

export function OperatorCredentialsControl() {
  const [revision, setRevision] = useState(0);
  const account = useRead<OperatorAccount>("/api/v1/operator/credentials", revision);
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) return setMessage({ ok: false, text: "New passwords do not match." });
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/operator/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, ...(username.trim() ? { newUsername: username.trim() } : {}) }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) return setMessage({ ok: false, text: errors[body.error ?? ""] ?? "Unable to update the login. Retry." });
      setMessage({ ok: true, text: "Login updated. Your browser will ask you to sign in again with the new credentials." });
      setUsername("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setRevision((value) => value + 1);
    } catch {
      setMessage({ ok: false, text: "Unable to update the login. Check connectivity and retry." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {account.error ? <ErrorState retry={() => setRevision((value) => value + 1)} /> : !account.data ? <Loading /> : (
        <Facts
          rows={[
            ["Operator username", account.data.username],
            ["Login source", account.data.source === "settings" ? "Changed in Settings" : "Environment default"],
            ["Last changed", account.data.updatedAt ? <Time key="changed" value={account.data.updatedAt} /> : "Never"],
          ]}
        />
      )}
      <form className="operator-credentials-form" onSubmit={submit}>
        <label>
          New username (optional)
          <input autoComplete="username" maxLength={100} onChange={(event) => setUsername(event.target.value)} placeholder={account.data?.username ?? ""} value={username} />
        </label>
        <label>
          Current password
          <input autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} required type="password" value={currentPassword} />
        </label>
        <label>
          New password (at least 16 characters)
          <input autoComplete="new-password" minLength={16} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} />
        </label>
        <label>
          Confirm new password
          <input autoComplete="new-password" minLength={16} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
        </label>
        <button className="button" disabled={busy} type="submit">{busy ? "Saving…" : "Change login"}</button>
        {message && <p className={message.ok ? "muted" : "form-error"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
      </form>
    </>
  );
}
