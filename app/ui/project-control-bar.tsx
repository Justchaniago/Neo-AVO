"use client";

import { useState } from "react";
import { useDashboard } from "./data";
import type { ProjectDetail } from "./model";
import { Badge, Time } from "./primitives";

export function ProjectControlBar({ detail }: { detail: ProjectDetail }) {
  const { refresh } = useDashboard();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const controlState = detail.project.controlState ?? "ACTIVE";
  const isPaused = controlState === "PAUSED" || controlState === "PAUSE_REQUESTED";
  const canStart = detail.project.capabilities.includes("runtime.start");

  async function sendControl(body: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/dashboard/projects/${detail.project.id}/control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Control action failed");
      }
      setPauseOpen(false);
      setReason("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error executing control action");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ border: "var(--line)", borderRadius: "var(--radius)", padding: "14px", marginBottom: "18px", background: isPaused ? "#fff9ec" : "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="eyebrow" style={{ margin: 0 }}>OPERATIONAL CONTROL</span>
            <Badge value={controlState} />
          </div>
          {isPaused && (
            <p className="muted" style={{ margin: "6px 0 0", fontSize: "12px" }}>
              {detail.project.pauseReason ? `Reason: ${detail.project.pauseReason}` : "Monitoring & alerting suppressed"}
              {detail.project.pausedUntil ? <> · Auto-resumes <Time value={detail.project.pausedUntil} /></> : " · Manual resume required"}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {!isPaused ? (
            <button type="button" onClick={() => setPauseOpen(true)} disabled={submitting}>
              Pause Project
            </button>
          ) : (
            <button type="button" onClick={() => sendControl({ action: "resume" })} disabled={submitting}>
              {submitting ? "Resuming..." : "Resume Project"}
            </button>
          )}
          {canStart && !isPaused && (
            <button type="button" onClick={() => sendControl({ action: "start" })} disabled={submitting}>
              {submitting ? "Starting..." : "Start / Run Now"}
            </button>
          )}
        </div>
      </div>

      {pauseOpen && (
        <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #eee" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendControl({
                action: "pause",
                ...(durationMinutes > 0 ? { durationMinutes } : {}),
                ...(reason.trim() ? { reason: reason.trim() } : {}),
              });
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "4px" }}>Duration (Safety TTL)</label>
                <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
                  <option value={60}>1 Hour</option>
                  <option value={360}>6 Hours</option>
                  <option value={1440}>24 Hours</option>
                  <option value={0}>Manual (No Auto-Resume)</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "4px" }}>Reason (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly spreadsheet maintenance"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button type="button" className="muted" onClick={() => setPauseOpen(false)} disabled={submitting}>Cancel</button>
              <button type="submit" disabled={submitting}>{submitting ? "Pausing..." : "Confirm Pause"}</button>
            </div>
          </form>
        </div>
      )}

      {error && <p style={{ color: "var(--coral)", fontSize: "12px", margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
