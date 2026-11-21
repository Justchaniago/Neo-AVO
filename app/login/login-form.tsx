"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "../ui/icons";
import { safeNextPath } from "../../src/operator/next-path";

const errors: Record<string, string> = {
  invalid_credentials: "Wrong username or password.",
  operator_auth_not_configured: "Operator login is not configured on this server.",
  operator_auth_unavailable: "The login service is unavailable. Retry in a moment.",
};


export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/operator/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (response.ok) return window.location.assign(safeNextPath(new URLSearchParams(window.location.search).get("next")));
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(errors[body.error ?? ""] ?? "Unable to sign in. Retry.");
    } catch {
      setError("Unable to sign in. Check connectivity and retry.");
    }
    setBusy(false);
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        Username
        <input autoCapitalize="none" autoComplete="username" autoFocus maxLength={100} onChange={(event) => setUsername(event.target.value)} required spellCheck={false} value={username} />
      </label>
      <label>
        Password
        <span className="login-password">
          <input autoComplete="current-password" maxLength={1024} onChange={(event) => setPassword(event.target.value)} required type={visible ? "text" : "password"} value={password} />
          <button aria-pressed={visible} onClick={() => setVisible(!visible)} type="button">{visible ? "Hide" : "Show"}</button>
        </span>
      </label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button className="button login-submit" disabled={busy} type="submit">
        {busy ? "Signing in…" : "Sign in"} <Icon name="arrow" />
      </button>
    </form>
  );
}
