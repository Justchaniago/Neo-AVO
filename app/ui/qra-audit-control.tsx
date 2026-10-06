"use client";

import { useEffect, useState } from "react";
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

const activeCommandStatuses = ["REQUESTED", "SENT", "ACKNOWLEDGED"];
const getRecoverableDates = (data: { missingDates: string[]; partialDates: { date: string }[] }) =>
  [...new Set([...data.missingDates, ...data.partialDates.map((item) => item.date)])].sort();

function PixelProgressBar({ isRunning, action }: { isRunning: boolean; action: "AUDIT" | "RESOLVE" }) {
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
      // Exponential ease to 95% while waiting; the server result completes it.
      const rawPct = Math.min(95, Math.floor((1 - Math.exp(-elapsed / 3500)) * 100));
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
          {action === "RESOLVE"
            ? (elapsedMs >= 15_000 ? "RESOLVE STILL RUNNING..." : "RESOLVING MISSING DATES...")
            : (elapsedMs >= 15_000 ? "AUDIT STILL RUNNING..." : "EXECUTING AUDIT...")}
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

export function QraAuditControl({ detail }: { detail: ProjectDetail }) {
  const { refresh } = useDashboard();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(getDefaultJakartaMonth);
  const [store, setStore] = useState<"ALL" | "PMS" | "TP6">("ALL");
  const [submitting, setSubmitting] = useState(false);
  const [resolvingStore, setResolvingStore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isQraProject = detail.project.slug === "qra-system" || detail.project.capabilities.includes("qra.audit_missing_dates");
  const latestAuditCommand = detail.commands.find((c) => c.capability === "qra.audit_missing_dates");
  const latestResolveCommand = detail.commands.find((c) => c.capability === "qra.resolve_missing_dates");
  const canAudit = detail.project.capabilities.includes("qra.audit_missing_dates");
  const canResolve = detail.project.capabilities.includes("qra.resolve_missing_dates");
  const auditIsRunning = [latestAuditCommand, latestResolveCommand].some((command) => !!command && activeCommandStatuses.includes(command.status));

  useEffect(() => {
    if (!auditIsRunning) return;
    const timer = setInterval(() => refresh(), 2_000);
    return () => clearInterval(timer);
  }, [auditIsRunning, refresh]);

  if (!isQraProject) return null;

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

  async function handleResolve(auditMonth: string, storeName: string, dates: string[]) {
    setResolvingStore(storeName);
    setError(null);
    try {
      const response = await fetch("/api/v1/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: detail.project.id,
          environment: detail.project.environment,
          capability: "qra.resolve_missing_dates",
          arguments: { month: auditMonth, store: storeName, dates },
          validUntil: new Date(Date.now() + 30 * 60_000).toISOString(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to issue resolve command");
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error issuing resolve command");
    } finally {
      setResolvingStore(null);
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
          disabled={submitting || auditIsRunning || !canAudit}
        >
          Audit Missing Dates
        </button>
      </div>

      <DailyReconcileResult events={detail.qraReconcileEvents ?? []} />

      {!canAudit && <p style={{ color: "var(--coral)", fontSize: "13px" }}>QRA audit capability is not enabled for this project.</p>}

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

      {error && <p style={{ color: "var(--coral)", fontSize: "13px" }}>{error}</p>}
      {latestAuditCommand && <AuditResultDisplay command={latestAuditCommand} resolveCommand={latestResolveCommand} canResolve={canResolve} onResolve={handleResolve} resolvingStore={resolvingStore} />}
      {latestResolveCommand && <ResolveResultDisplay command={latestResolveCommand} />}
    </div>
  );
}

function DailyReconcileResult({ events }: { events: NonNullable<ProjectDetail["qraReconcileEvents"]> }) {
  const attempts = new Map<string, typeof events>();
  for (const event of events) {
    const commandId = String(event.data.commandId ?? event.eventId);
    attempts.set(commandId, [...(attempts.get(commandId) ?? []), event]);
  }
  const latestAttempt = [...attempts.values()].sort((a, b) => {
    const aEvent = a.find((event) => event.type === "qra.reconcile.started") ?? a[0];
    const bEvent = b.find((event) => event.type === "qra.reconcile.started") ?? b[0];
    return Date.parse(String(bEvent.data.date ?? bEvent.occurredAt)) - Date.parse(String(aEvent.data.date ?? aEvent.occurredAt))
      || Date.parse(bEvent.occurredAt) - Date.parse(aEvent.occurredAt)
      || bEvent.eventId.localeCompare(aEvent.eventId);
  })[0] ?? [];
  const latest = latestAttempt.find((event) => event.type === "qra.reconcile.completed" || event.type === "qra.reconcile.failed")
    ?? latestAttempt.find((event) => event.type === "qra.reconcile.started");
  const storeResults = latest?.data.stores as Record<string, { status: string; reason: string; metrics?: string[] }> | undefined;

  return (
    <section aria-label="Daily QRA reconcile" style={{ border: "1px solid var(--ink)", borderRadius: "var(--radius)", padding: "14px", marginBottom: "16px", background: "#f6fbfa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <span className="eyebrow" style={{ margin: 0 }}>SCHEDULED · READ ONLY · 00:00 WIB</span>
          <h4 style={{ margin: "4px 0" }}>Daily Reconcile</h4>
          <p className="muted" style={{ margin: 0, fontSize: "12px" }}>Checks yesterday’s QRA receipt against the Sheet. It does not extract, write, or repair data.</p>
        </div>
        {latest ? <Badge value={latest.type === "qra.reconcile.started" ? "RUNNING" : latest.type === "qra.reconcile.failed" ? "EXECUTION FAILED" : String(latest.data.outcome ?? "RESULT RECEIVED")} /> : <Badge value="AWAITING TELEMETRY" />}
      </div>
      {!latest && <p className="muted" style={{ margin: "12px 0 0", fontSize: "12px" }}>No reconcile result has been received by Neo AVO yet. This view does not trigger a reconcile.</p>}
      {latest && (
        <div style={{ marginTop: "12px" }}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "12px", marginBottom: "8px" }}>
            <span>Business date: <strong>{String(latest.data.date ?? "Unknown")}</strong></span>
            <span>Operation: <strong>{String(latest.data.status ?? "Unknown")}</strong></span>
            <span>Mutation: <strong>{String(latest.data.mutation ?? "Unknown")}</strong></span>
            <span>Received: <Time value={latest.receivedAt} /></span>
            {latest.type === "qra.reconcile.started" && <span>Started: <Time value={latest.occurredAt} /></span>}
          </div>
          {storeResults && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "8px" }}>
            {(["PMS", "TP6"] as const).map((storeName) => {
              const result = storeResults[storeName];
              if (!result) return null;
              const good = result.status === "VERIFIED";
              const tone = good ? "var(--secondary)" : result.status === "VERIFIED_PARTIAL" ? "var(--orange)" : "var(--coral)";
              return <div key={storeName} style={{ background: "white", border: "1px solid #ddd", borderRadius: "4px", padding: "9px", fontSize: "12px" }}>
                <strong>{storeName}</strong><div style={{ color: tone, fontWeight: "bold", marginTop: "3px" }}>{result.status}</div>
                <div className="muted" style={{ marginTop: "3px" }}>{result.reason}</div>
                {!!result.metrics?.length && <div style={{ marginTop: "3px" }}>Metrics: {result.metrics.join(", ")}</div>}
              </div>;
            })}
          </div>}
          {latest.type === "qra.reconcile.started" && <p className="muted" style={{ fontSize: "12px", margin: "8px 0 0" }}>Latest attempt is in progress; waiting for its terminal event.</p>}
          {latest.data.outcome !== "VERIFIED" && latest.type !== "qra.reconcile.failed" && <p style={{ color: "var(--orange)", fontSize: "12px", margin: "8px 0 0" }}>Reconcile completed and reported a data/check finding. Review it with Monthly Completeness Audit; recovery remains an explicit separate action.</p>}
        </div>
      )}
    </section>
  );
}

function AuditResultDisplay({
  command,
  resolveCommand,
  canResolve,
  onResolve,
  resolvingStore,
}: {
  command: NonNullable<ProjectDetail["commands"]>[number];
  resolveCommand?: NonNullable<ProjectDetail["commands"]>[number];
  canResolve: boolean;
  onResolve: (month: string, store: string, dates: string[]) => void;
  resolvingStore: string | null;
}) {
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
        <div>
          <p className="muted" style={{ margin: 0 }}>
            {command.status === "REQUESTED" && "Audit command queued. Waiting for QRA to pick it up..."}
            {command.status === "SENT" && "QRA received the audit command. Waiting for acknowledgement or result..."}
            {command.status === "ACKNOWLEDGED" && "QRA is executing the audit. Waiting for the persisted result..."}
          </p>
          <PixelProgressBar isRunning={isRunning} action="AUDIT" />
          <p className="muted" style={{ margin: "8px 0 0", fontSize: "12px" }}>
            This view refreshes automatically every 2 seconds while the command is active.
          </p>
        </div>
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
                {(storeData.missingDates.length > 0 || storeData.partialDates.length > 0) && (
                  <button
                    type="button"
                    onClick={() => onResolve(String(command.arguments?.month || ""), storeName, getRecoverableDates(storeData))}
                    disabled={!canResolve || !!resolvingStore || (resolveCommand != null && activeCommandStatuses.includes(resolveCommand.status))}
                    style={{ marginTop: "10px", fontSize: "12px" }}
                  >
                    {resolvingStore === storeName
                      ? "Initiating..."
                      : `Resolve ${getRecoverableDates(storeData).length} missing/partial date${getRecoverableDates(storeData).length === 1 ? "" : "s"}`}
                  </button>
                )}
                {!canResolve && (storeData.missingDates.length > 0 || storeData.partialDates.length > 0) && (
                  <div style={{ color: "var(--coral)", fontSize: "11px", marginTop: "8px" }}>QRA recovery capability is not enabled.</div>
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

function ResolveResultDisplay({
  command,
}: {
  command: NonNullable<ProjectDetail["commands"]>[number];
}) {
  const isRunning = activeCommandStatuses.includes(command.status);
  const result = command.result as {
    dates?: { date: string; status: string; reason?: string; runId?: string }[];
    completed?: number;
    skipped?: number;
    partial?: number;
    failed?: number;
    conflicts?: number;
    mutation?: string;
    durationMs?: number;
  } | null;

  return (
    <div className="audit-result-card" style={{ border: "var(--line)", borderRadius: "var(--radius)", padding: "16px", background: "white", marginTop: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div>
          <span className="eyebrow" style={{ margin: 0 }}>LATEST RESOLVE RESULT</span>
          <h4 style={{ margin: "4px 0 0 0" }}>
            {command.arguments?.month ? formatMonthLabel(String(command.arguments.month)) : "Resolve Missing Dates"} ({String(command.arguments?.store || "UNKNOWN")})
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
            {command.status === "REQUESTED" && "Resolve command queued. Waiting for QRA to pick it up..."}
            {command.status === "SENT" && "QRA received the resolve command. Waiting for acknowledgement or result..."}
            {command.status === "ACKNOWLEDGED" && "QRA is processing only the selected missing dates..."}
          </p>
          <PixelProgressBar isRunning={isRunning} action="RESOLVE" />
          <p className="muted" style={{ margin: "8px 0 0", fontSize: "12px" }}>
            This view refreshes automatically every 2 seconds while the resolve command is active.
          </p>
        </div>
      )}

      {command.status === "FAILED" && (
        <p style={{ color: "var(--coral)", margin: 0 }}>
          Resolve Failed: {command.failureReason || "Unknown failure"}
        </p>
      )}

      {command.status === "REJECTED" && (
        <p style={{ color: "var(--coral)", margin: 0 }}>
          Resolve Rejected: {command.rejectionReason || "Command rejected"}
        </p>
      )}

      {command.status === "COMPLETED" && result && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "12px", color: "var(--secondary)", borderBottom: "1px solid #eee", paddingBottom: "8px", marginBottom: "10px" }}>
            <span>Completed: {result.completed ?? 0}</span>
            <span>Skipped: {result.skipped ?? 0}</span>
            <span>Still partial: {result.partial ?? 0}</span>
            <span>Failed: {result.failed ?? 0}</span>
            <span>Conflicts: {result.conflicts ?? 0}</span>
            <span>Mutation: {result.mutation || "NO_OVERWRITE"}</span>
            {result.durationMs != null && <span>Duration: {(result.durationMs / 1000).toFixed(1)}s</span>}
          </div>
          {result.dates && result.dates.length > 0 && (
            <div style={{ display: "grid", gap: "6px", fontSize: "12px" }}>
              {result.dates.map((item) => (
                <div key={`${item.date}-${item.status}`} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <span>{item.date}</span>
                  <span style={{ color: item.status === "COMPLETED" ? "var(--secondary)" : item.status === "FAILED" ? "var(--coral)" : "var(--orange)" }}>
                    {item.status}{item.reason ? ` — ${item.reason}` : ""}
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
