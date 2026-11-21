"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "../icons";
import { Badge, Facts, PageTitle, percent } from "../primitives";
import { getTelemetryFreshness } from "../model";
import { ResourceLineChart } from "../resource-chart";
import { CloudObserverSurface } from "../cloud-observer";
import { blastRadiusFactRows, episodeFactRows, serviceFactRows } from "../infrastructure-panels";
import { loadAverages, serviceRows, serviceSummary } from "../../../src/ops/infrastructure-view";

export function MobileInfrastructure() {
  const [range, setRange] = useState<"1h" | "6h" | "24h" | "7d" | "30d">("24h");
  const [infra, setInfra] = useState<{
    host?: { name: string; provider: string; environment: string; region: string; hostname: string; architecture: string; vcpuCount: number };
    monitoredServices?: Array<{ name: string; displayName: string; projectAssociation: string; criticality: string; status?: string }>;
    latestSnapshot?: { cpuPercent: number; memoryPercent: number; diskPercent: number; serviceState?: Record<string, unknown>; observedAt: string };
    history?: Array<{ cpuPercent: number; memoryPercent: number; diskPercent: number; pressureStatePeak?: string; observedAt: string }>;
  } | null>(null);
  const [infraFailed, setInfraFailed] = useState(false);

  useEffect(() => {
    const load = () => {
      fetch(`/api/v1/infrastructure?range=${range}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`infrastructure ${res.status}`))))
        .then((data) => {
          setInfra(data);
          setInfraFailed(false);
        })
        .catch(() => setInfraFailed(true));
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [range]);

  const latest = infra?.latestSnapshot;
  const state = (latest?.serviceState as { pressureState?: string })?.pressureState || (latest ? "NORMAL" : "UNKNOWN");
  const services = serviceRows(infra?.monitoredServices, latest?.serviceState);
  const load = loadAverages(latest?.serviceState);
  const hostName = infra?.host?.name || "—";
  const freshness = latest?.observedAt ? getTelemetryFreshness(latest.observedAt) : "UNKNOWN";

  return (
    <div className="mobile-infrastructure">
      {/* Header */}
      <PageTitle
        eyebrow="Mission control / Infrastructure"
        title="Host Telemetry"
        description={`Live resource metrics, historical telemetry, and blast-radius context for ${infra?.host?.name || "the monitored host"}.`}
      />
      <CloudObserverSurface mobile />

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
              ["Host", infra?.host ? `${infra.host.name} (${infra.host.provider})` : "—"],
              ["System Load (Capacity)", percent(latest?.cpuPercent)],
              ["Memory Usage", percent(latest?.memoryPercent)],
              ["Disk Usage", percent(latest?.diskPercent)],
              ["Load Average (1m / 5m / 15m)", load ? load.map((value) => value.toFixed(2)).join(" / ") : "—"],
              ["Services", serviceSummary(services)],
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
              : infraFailed
                ? "Resource history could not be loaded. Retrying…"
                : infra
                  ? `No resource history has been recorded for the last ${range}.`
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
          ) : null}
        </div>
      </section>

      {/* 03. Monitored Services & Ownership */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">03 / Services & Ownership</h2>
        <div className="mobile-card">
          <Facts rows={serviceFactRows(services)} />
        </div>
      </section>

      {/* 04. Blast Radius */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">04 / Blast-Radius Context</h2>
        <div className="mobile-card">
          <Facts rows={blastRadiusFactRows(hostName, services)} />
        </div>
      </section>

      {/* 05. Pressure Episodes & Incident Context */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">05 / Pressure Episodes ({range})</h2>
        <div className="mobile-card">
          <Facts rows={episodeFactRows(infra?.history, range, Boolean(infra))} />
        </div>
      </section>
    </div>
  );
}
