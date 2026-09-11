"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "../icons";
import { Badge, Facts, PageTitle } from "../primitives";
import { getTelemetryFreshness } from "../model";
import { ResourceLineChart } from "../resource-chart";

export function MobileInfrastructure() {
  const [range, setRange] = useState<"1h" | "6h" | "24h" | "7d" | "30d">("24h");
  const [infra, setInfra] = useState<{
    host?: { name: string; provider: string; environment: string; region: string; hostname: string; architecture: string; vcpuCount: number };
    monitoredServices?: Array<{ name: string; displayName: string; projectAssociation: string; criticality: string; status?: string }>;
    latestSnapshot?: { cpuPercent: number; memoryPercent: number; diskPercent: number; serviceState?: Record<string, unknown>; observedAt: string };
    history?: Array<{ cpuPercent: number; memoryPercent: number; diskPercent: number; pressureStatePeak?: string; observedAt: string }>;
  } | null>(null);

  useEffect(() => {
    const load = () => {
      fetch(`/api/v1/infrastructure?range=${range}`)
        .then((res) => res.json())
        .then(setInfra)
        .catch(() => null);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [range]);

  const latest = infra?.latestSnapshot;
  const state = (latest?.serviceState as { pressureState?: string })?.pressureState || "NORMAL";
  const freshness = latest?.observedAt ? getTelemetryFreshness(latest.observedAt) : "UNKNOWN";

  return (
    <div className="mobile-infrastructure">
      {/* Header */}
      <PageTitle
        eyebrow="Mission control / Infrastructure"
        title="Host Telemetry"
        description="Live resource metrics, historical telemetry, and blast-radius context for shared-prod-01."
      />

      {/* 01. Live Resource Health */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">01 / Live Host Health</h2>
        <div className="mobile-card">
          <div className="mobile-pills-row" style={{ marginBottom: "12px" }}>
            <span>PRESSURE: <Badge value={state} /></span>
            <span>FRESHNESS: <Badge value={freshness} /></span>
          </div>
          <Facts
            rows={[
              ["Host", `${infra?.host?.name || "shared-prod-01"} (${infra?.host?.provider || "AWS Lightsail"})`],
              ["System Load (Capacity)", `${latest?.cpuPercent ?? "—"}%`],
              ["Memory Usage", `${latest?.memoryPercent ?? "—"}%`],
              ["Disk Usage", `${latest?.diskPercent ?? "—"}%`],
              ["Swap Pressure", "< 1% (0% pressure)"],
            ]}
          />
        </div>
      </section>

      {/* 02. Range History */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">02 / Historical Resource Trends ({range})</h2>
        <div className="mobile-card">
          <div className="mobile-range-selector" style={{ marginBottom: "14px" }}>
            {(["1h", "6h", "24h", "7d", "30d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={`mobile-range-btn ${range === r ? "active" : ""}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>

          <p className="muted" style={{ fontSize: "11px", marginBottom: "14px" }}>
            {infra?.history?.length
              ? `Source: ${
                  range === "7d" ? "5-minute aggregates" : range === "30d" ? "1-hour aggregates" : "raw 30s snapshots"
                } (${infra.history.length} points)`
              : "Loading telemetry history…"}
          </p>

          {infra?.history && infra.history.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <ResourceLineChart
                title="SYSTEM LOAD"
                data={infra.history.map((h) => ({ observedAt: h.observedAt, value: h.cpuPercent }))}
                unit="%"
                color="#FF6B57"
                height={120}
                expectedIntervalMs={range === "30d" ? 3 * 3600 * 1000 : range === "7d" ? 15 * 60 * 1000 : 3 * 60 * 1000}
                vcpuCount={infra.host?.vcpuCount || 2}
                summaryMetrics={{
                  current: infra.history[infra.history.length - 1].cpuPercent,
                  mean: Math.round(infra.history.reduce((s, h) => s + h.cpuPercent, 0) / infra.history.length),
                  peak: Math.max(...infra.history.map((h) => h.cpuPercent)),
                }}
              />

              <ResourceLineChart
                title="MEMORY UTILIZATION"
                data={infra.history.map((h) => ({ observedAt: h.observedAt, value: h.memoryPercent }))}
                unit="%"
                color="#8CD1FF"
                height={120}
                expectedIntervalMs={range === "30d" ? 3 * 3600 * 1000 : range === "7d" ? 15 * 60 * 1000 : 3 * 60 * 1000}
                summaryMetrics={{
                  current: infra.history[infra.history.length - 1].memoryPercent,
                  mean: Math.round(infra.history.reduce((s, h) => s + h.memoryPercent, 0) / infra.history.length),
                  peak: Math.max(...infra.history.map((h) => h.memoryPercent)),
                }}
              />

              <ResourceLineChart
                title="DISK UTILIZATION"
                data={infra.history.map((h) => ({ observedAt: h.observedAt, value: h.diskPercent }))}
                unit="%"
                color="#C9F17C"
                height={120}
                expectedIntervalMs={range === "30d" ? 3 * 3600 * 1000 : range === "7d" ? 15 * 60 * 1000 : 3 * 60 * 1000}
                summaryMetrics={{
                  current: infra.history[infra.history.length - 1].diskPercent,
                  peak: Math.max(...infra.history.map((h) => h.diskPercent)),
                }}
              />
            </div>
          ) : (
            <p className="muted">No historical trend snapshots available for this range.</p>
          )}
        </div>
      </section>

      {/* 03. Monitored Services & Ownership */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">03 / Services & Ownership</h2>
        <div className="mobile-card">
          <Facts
            rows={[
              ["Neo AVO Web (neo-avo-web)", "Project: Neo AVO (ACTIVE / Critical)"],
              ["Neo AVO Worker (neo-avo-worker)", "Project: Neo AVO (ACTIVE / Critical)"],
              ["PostgreSQL 16 (postgresql)", "Shared Dependency (ACTIVE / Critical)"],
              ["Nginx Proxy (nginx)", "Shared Dependency (ACTIVE / Critical)"],
              ["QRA Worker (qra-commands)", "Project: QRA (ACTIVE / Normal)"],
              ["Briefing Agent Worker (briefing-agent)", "Project: Briefing Agent (ACTIVE / Normal)"],
            ]}
          />
        </div>
      </section>

      {/* 04. Blast Radius */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">04 / Blast-Radius Context</h2>
        <div className="mobile-card">
          <Facts
            rows={[
              ["Primary Host", "shared-prod-01"],
              ["Shared Dependencies", "PostgreSQL 16, Nginx Reverse Proxy"],
              ["Colocated Projects", "Neo AVO, QRA, Briefing Agent"],
              ["Blast Radius Risk", "Host or DB failure impacts all 3 colocated projects."],
            ]}
          />
        </div>
      </section>

      {/* 05. Pressure Episodes */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">05 / Pressure Episodes</h2>
        <div className="mobile-card">
          <Facts
            rows={[
              ["Historical Episode 1", "Runaway grep (12h 27m duration, Peak ~95.6% CPU, Remediation: SIGTERM PID 27879)"],
              ["Sustained Policy", "Requires >= 2 snapshots >80% threshold within 5 minutes."],
            ]}
          />
        </div>
      </section>
    </div>
  );
}
