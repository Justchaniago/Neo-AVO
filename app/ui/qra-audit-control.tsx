"use client";

import { useState } from "react";
import { useDashboard } from "./data";
import type { ProjectDetail } from "./model";
import { Badge, Time } from "./primitives";

function getDefaultJakartaMonth() {
  const now = new Date();
  const options = { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" } as const;
  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
}

function formatMonthLabel(monthStr: string) {
  try {
    const [year, month] = monthStr.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleString("en-US", { month: "long", year: "numeric" });
  } catch {
    return monthStr;
  }
}

export function QraAuditControl({ detail }: { detail: ProjectDetail }) {
  const { refresh } = useDashboard();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(getDefaultJakartaMonth);
  const [store, setStore] = useState<"ALL" | "PMS" | "TP6">("ALL");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCapability = detail.project.capabilities.includes("qra.audit_missing_dates");
  if (!hasCapability) return null;

  const latestAuditCommand = detail.commands.find((c) => c.capability === "qra.audit_missing_dates");

  async function handleRunAudit(e: React.FormEvent) {
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
          capability: "qra.audit_missing_dates",
          arguments: { month, store },
          validUntil: new Date(Date.now() + 15 * 60_000).toISOString(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to issue audit command");
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
    <div className="qra-audit-section" style={{ marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div>
          <h3 style={{ margin: 0 }}>Audit Missing Dates</h3>
          <p className="muted" style={{ margin: 0 }}>Read-only report completeness check for PMS & TP6</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          disabled={submitting || latestAuditCommand?.status === "REQUESTED" || latestAuditCommand?.status === "SENT"}
        >
          Audit Missing Dates
        </button>
      </div>

      {open && (
        <div className="modal-backdrop" style={{ border: "var(--line)", borderRadius: "var(--radius)", padding: "16px", background: "var(--canvas)", marginBottom: "16px" }}>
          <form onSubmit={handleRunAudit}>
            <h4 style={{ marginTop: 0 }}>Run Report Completeness Audit</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "4px" }}>Month (YYYY-MM)</label>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
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
            </div>
            {error && <p style={{ color: "var(--coral)", fontSize: "13px" }}>{error}</p>}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button type="button" className="muted" onClick={() => setOpen(false)} disabled={submitting}>Cancel</button>
              <button type="submit" disabled={submitting}>{submitting ? "Initiating..." : "Run Audit"}</button>
            </div>
          </form>
        </div>
      )}

      {latestAuditCommand && <AuditResultDisplay command={latestAuditCommand} />}
    </div>
  );
}

function AuditResultDisplay({ command }: { command: NonNullable<ProjectDetail["commands"]>[number] }) {
  const isRunning = command.status === "REQUESTED" || command.status === "SENT" || command.status === "ACKNOWLEDGED";
  const result = command.result as {
    commandId?: string;
    commandType?: string;
    month?: string;
    scope?: string;
    expectedDates?: number;
    stores?: Record<string, { complete: number; missing: number; partial: number; missingDates: string[]; partialDates: { date: string; missingMetrics: string[] }[] }>;
    mutation?: string;
    durationMs?: number;
  } | null;

  return (
    <div className="audit-result-card" style={{ border: "var(--line)", borderRadius: "var(--radius)", padding: "16px", background: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div>
          <span className="eyebrow" style={{ margin: 0 }}>LATEST AUDIT RESULT</span>
          <h4 style={{ margin: "4px 0 0 0" }}>
            {command.arguments?.month ? formatMonthLabel(String(command.arguments.month)) : "Audit"} ({String(command.arguments?.store || "ALL")})
          </h4>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Badge value={command.status} />
          <Time value={command.requestedAt} />
        </div>
      </div>

      {isRunning && (
        <p className="muted" style={{ margin: 0 }}>
          Audit command requested. Awaiting execution and result from QRA...
        </p>
      )}

      {command.status === "FAILED" && (
        <p style={{ color: "var(--coral)", margin: 0 }}>
          Audit Failed: {command.failureReason || "Unknown failure"}
        </p>
      )}

      {command.status === "REJECTED" && (
        <p style={{ color: "var(--coral)", margin: 0 }}>
          Audit Rejected: {command.rejectionReason || "Command rejected"}
        </p>
      )}

      {command.status === "COMPLETED" && result && result.stores && (
        <div className="audit-details">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "12px" }}>
            {Object.entries(result.stores).map(([storeName, storeData]) => (
              <div key={storeName} style={{ background: "var(--canvas)", padding: "12px", borderRadius: "6px", border: "1px solid var(--muted)" }}>
                <div style={{ fontWeight: "bold", fontSize: "14px", marginBottom: "6px" }}>{storeName}</div>
                <div style={{ fontSize: "13px", marginBottom: "4px" }}>
                  <strong>{storeData.complete} / {result.expectedDates}</strong> complete
                </div>
                {storeData.missingDates.length > 0 && (
                  <div style={{ fontSize: "12px", color: "var(--coral)", marginBottom: "4px" }}>
                    Missing: {storeData.missingDates.join(", ")}
                  </div>
                )}
                {storeData.partialDates.length > 0 && (
                  <div style={{ fontSize: "12px", color: "var(--orange)" }}>
                    Partial: {storeData.partialDates.map((p) => `${p.date} (${p.missingMetrics.join(", ")})`).join("; ")}
                  </div>
                )}
                {storeData.missingDates.length === 0 && storeData.partialDates.length === 0 && (
                  <div style={{ fontSize: "12px", color: "var(--secondary)" }}>No missing or partial dates.</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--secondary)", borderTop: "1px solid #eee", paddingTop: "8px" }}>
            <span>Total Missing: {Object.values(result.stores).reduce((acc, s) => acc + s.missing, 0)}</span>
            <span>Total Partial: {Object.values(result.stores).reduce((acc, s) => acc + s.partial, 0)}</span>
            <span>Mutation: {result.mutation || "NONE"}</span>
            {result.durationMs != null && <span>Duration: {(result.durationMs / 1000).toFixed(1)}s</span>}
          </div>
        </div>
      )}
    </div>
  );
}
