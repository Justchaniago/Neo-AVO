import { describe, expect, it } from "vitest";
import { blastRadius, formatDuration, loadAverages, pressureEpisodes, serviceRows, serviceSummary } from "../src/ops/infrastructure-view";

const definitions = [
  { name: "web", displayName: "Web", projectAssociation: "neo-avo", criticality: "CRITICAL" },
  { name: "worker", displayName: "Worker", projectAssociation: "neo-avo", criticality: "CRITICAL" },
  { name: "postgresql", displayName: "PostgreSQL", projectAssociation: "platform", criticality: "CRITICAL" },
];
const point = (minute: number, peak: string, cpu = 10) => ({
  cpuPercent: cpu, memoryPercent: 20, diskPercent: 30, pressureStatePeak: peak,
  observedAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
});

describe("infrastructure view", () => {
  it("reports UNKNOWN when the snapshot has no service statuses", () => {
    const rows = serviceRows(definitions, {});
    expect(rows.map((row) => row.status)).toEqual(["UNKNOWN", "UNKNOWN", "UNKNOWN"]);
    expect(serviceSummary(rows)).toBe("3 monitored · status not reported");
  });

  it("joins reported statuses and counts only active services", () => {
    const rows = serviceRows(definitions, { services: [{ name: "web", status: "ACTIVE" }, { name: "worker", status: "FAILED" }, { name: 3 }] });
    expect(rows.map((row) => row.status)).toEqual(["ACTIVE", "FAILED", "UNKNOWN"]);
    expect(serviceSummary(rows)).toBe("1 / 3 monitored services active");
    expect(blastRadius(rows)).toEqual({ sharedServices: ["PostgreSQL"], projects: ["neo-avo"] });
  });

  it("reads load averages only when all three are numbers", () => {
    expect(loadAverages({ load1: 0.5, load5: 0.4, load15: 0.3 })).toEqual([0.5, 0.4, 0.3]);
    expect(loadAverages({ load1: 0.5 })).toBeNull();
    expect(loadAverages(null)).toBeNull();
  });

  it("groups consecutive pressure points into episodes, newest first", () => {
    const episodes = pressureEpisodes([
      point(0, "NORMAL"), point(1, "WARNING", 80), point(2, "CRITICAL", 96), point(3, "NORMAL"),
      point(4, "NORMAL"), point(5, "WARNING", 85),
    ]);
    expect(episodes).toHaveLength(2);
    expect(episodes[0]).toMatchObject({ ongoing: true, peakState: "WARNING", peakCpuPercent: 85 });
    expect(episodes[1]).toMatchObject({ ongoing: false, peakState: "CRITICAL", peakCpuPercent: 96 });
    expect(formatDuration(episodes[1].startedAt, episodes[1].endedAt)).toBe("2m");
    expect(pressureEpisodes([])).toEqual([]);
  });

  it("formats durations", () => {
    expect(formatDuration("2026-01-01T00:00:00Z", "2026-01-01T12:27:00Z")).toBe("12h 27m");
    expect(formatDuration("2026-01-01T00:00:00Z", "2026-01-01T00:00:10Z")).toBe("under 1m");
  });
});
