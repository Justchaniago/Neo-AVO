"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "./data";
import type { ProjectDetail } from "./model";
import { Badge, Time } from "./primitives";

function getDefaultJakartaDate() {
  const now = new Date();
  const options = { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" } as const;
  const parts = new Intl.DateTimeFormat("en-CA", options).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

const activeCommandStatuses = ["REQUESTED", "SENT", "ACKNOWLEDGED"];

function PixelProgressBar({ isRunning }: { isRunning: boolean }) {
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      setProgress(100);
      setElapsedMs(0);
      return;
    }
    setProgress(0);
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setElapsedMs(elapsed);
      const rawPct = Math.min(95, Math.floor((1 - Math.exp(-elapsed / 2500)) * 100));
      setProgress(rawPct);
    }, 100);

    return () => clearInterval(interval);
  }, [isRunning]);

  const totalBlocks = 20;
  const filledBlocks = Math.round((progress / 100) * totalBlocks);

  return (
    <div style={{ marginTop: "10px", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "bold", fontFamily: "var(--mono)", marginBottom: "4px" }}>
        <span>
          {elapsedMs >= 15_000 ? "REGENERATION STILL RUNNING..." : "REGENERATING BRIEFINGS..."}
        </span>
        <span>{progress}%</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${totalBlocks}, 1fr)`,
          gap: "3px",
          padding: "4px",
          background: "var(--ink)",
          borderRadius: "4px",
          border: "1px solid var(--ink)",
        }}
      >
        {Array.from({ length: totalBlocks }).map((_, i) => (
          <div
            key={i}
            style={{
              height: "12px",
              backgroundColor: i < filledBlocks ? "#7fe3e0" : "#222225",
              borderRadius: "1px",
              boxShadow: i < filledBlocks ? "0 0 6px rgba(127, 227, 224, 0.6)" : "none",
              transition: "background-color 0.15s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function BriefingRegenerateControl({ detail }: { detail: ProjectDetail }) {
  const { refresh } = useDashboard();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(getDefaultJakartaDate);
  const [store, setStore] = useState<"ALL" | "PMS" | "TP6">("ALL");
  const [briefingType, setBriefingType] = useState<"BOTH" | "MORNING" | "CLOSING">("BOTH");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBriefingProject = detail.project.slug === "briefing-agent" || detail.project.capabilities.includes("briefing.regenerate");
  const latestCommand = detail.commands.find((c) => c.capability === "briefing.regenerate");
  const isRunning = !!latestCommand && activeCommandStatuses.includes(latestCommand.status);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => refresh(), 2_000);
    return () => clearInterval(timer);
  }, [isRunning, refresh]);

  if (!isBriefingProject) return null;

  async function handleRegenerate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: detail.project.id,
          environment: detail.project.environment,
          capability: "briefing.regenerate",
          arguments: {
            store,
            type: briefingType,
            briefingType,
            date,
          },
          validUntil: new Date(Date.now() + 15 * 60_000).toISOString(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to issue regenerate command");
      }
      setOpen(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error issuing command");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="briefing-regenerate-section" style={{ marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div>
          <h3 style={{ margin: 0 }}>Regenerate Briefing</h3>
          <p className="muted" style={{ margin: 0 }}>Deterministic on-demand briefing regeneration for PMS & TP6</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          disabled={submitting || isRunning}
        >
          Regenerate Briefing
        </button>
      </div>

      {open && (
        <div className="modal-backdrop" style={{ border: "var(--line)", borderRadius: "var(--radius)", padding: "16px", background: "var(--canvas)", marginBottom: "16px" }}>
          <form onSubmit={handleRegenerate}>
            <h4 style={{ marginTop: 0 }}>Request Briefing Regeneration</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "4px" }}>Date (YYYY-MM-DD)</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "4px" }}>Store Scope</label>
                <select value={store} onChange={(e) => setStore(e.target.value as "ALL" | "PMS" | "TP6")}>
                  <option value="ALL">All Stores (PMS & TP6)</option>
                  <option value="PMS">PMS</option>
                  <option value="TP6">TP6</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "4px" }}>Briefing Type</label>
                <select value={briefingType} onChange={(e) => setBriefingType(e.target.value as "BOTH" | "MORNING" | "CLOSING")}>
                  <option value="BOTH">Both (Morning & Closing)</option>
                  <option value="MORNING">Morning Only</option>
                  <option value="CLOSING">Closing Only</option>
                </select>
              </div>
            </div>
            {error && <p style={{ color: "var(--coral)", fontSize: "13px" }}>{error}</p>}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button type="button" className="muted" onClick={() => setOpen(false)} disabled={submitting}>Cancel</button>
              <button type="submit" disabled={submitting}>{submitting ? "Initiating..." : "Execute Regeneration"}</button>
            </div>
          </form>
        </div>
      )}

      {error && <p style={{ color: "var(--coral)", fontSize: "13px" }}>{error}</p>}
      {latestCommand && <RegenerateResultDisplay command={latestCommand} />}
    </div>
  );
}

function RegenerateResultDisplay({
  command,
}: {
  command: NonNullable<ProjectDetail["commands"]>[number];
}) {
  const isRunning = activeCommandStatuses.includes(command.status);
  const result = command.result as {
    commandId?: string;
    store?: string;
    briefingType?: string;
    date?: string;
    status?: string;
    briefings?: Array<{ store: string; type: string; status: string; date?: string; error?: string }>;
  } | null;

  const args = (command.arguments || {}) as { store?: string; type?: string; briefingType?: string; date?: string };
  const storeLabel = args.store || "ALL";
  const typeLabel = args.type || args.briefingType || "BOTH";
  const dateLabel = args.date || "";

  return (
    <div className="briefing-result-card" style={{ border: "var(--line)", borderRadius: "var(--radius)", padding: "16px", background: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div>
          <span className="eyebrow" style={{ margin: 0 }}>LATEST REGENERATION COMMAND</span>
          <h4 style={{ margin: "4px 0 0 0" }}>
            {typeLabel} ({storeLabel}) — {dateLabel}
          </h4>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Badge value={command.status} />
          <Time value={command.requestedAt} />
        </div>
      </div>

      {isRunning && (
        <div>
          <p className="muted" style={{ margin: 0 }}>
            {command.status === "REQUESTED" && "Command queued in Neo AVO. Waiting for Briefing Agent to claim..."}
            {command.status === "SENT" && "Briefing Agent received the command. Starting execution..."}
            {command.status === "ACKNOWLEDGED" && "Briefing Agent is regenerating briefings and sending output..."}
          </p>
          <PixelProgressBar isRunning={isRunning} />
          <p className="muted" style={{ margin: "8px 0 0", fontSize: "12px" }}>
            This view refreshes automatically every 2 seconds while the command is active.
          </p>
        </div>
      )}

      {command.status === "FAILED" && (
        <p style={{ color: "var(--coral)", margin: 0 }}>
          Regeneration Failed: {command.failureReason || "Unknown failure"}
        </p>
      )}

      {command.status === "REJECTED" && (
        <p style={{ color: "var(--coral)", margin: 0 }}>
          Regeneration Rejected: {command.rejectionReason || "Command rejected"}
        </p>
      )}

      {command.status === "COMPLETED" && (
        <div>
          <p style={{ color: "var(--secondary)", margin: "0 0 8px 0", fontSize: "13px", fontWeight: "bold" }}>
            Briefing regeneration completed successfully.
          </p>
          {result?.briefings && (
            <div style={{ display: "grid", gap: "6px", fontSize: "12px" }}>
              {result.briefings.map((b, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", background: "var(--canvas)", padding: "8px 12px", borderRadius: "4px" }}>
                  <span><strong>{b.store}</strong> {b.type}</span>
                  <span style={{ color: b.status === "SUCCESS" ? "var(--secondary)" : "var(--coral)" }}>
                    {b.status} {b.error ? `(${b.error})` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
