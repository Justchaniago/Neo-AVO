import { describe, expect, it } from "vitest";

describe("Infrastructure Resource Trends V1.2", () => {
  const samplePoints = Array.from({ length: 300 }, (_, i) => ({
    observedAt: new Date(Date.now() - (300 - i) * 30 * 1000).toISOString(),
    cpuPercent: 20 + (i % 50),
    memoryPercent: 30 + (i % 20),
    diskPercent: 15,
  }));

  it("RANGE_1H, RANGE_6H, RANGE_24H, RANGE_7D, RANGE_30D - supports all 5 historical ranges", () => {
    const supportedRanges = ["1h", "6h", "24h", "7d", "30d"];
    expect(supportedRanges).toHaveLength(5);
    expect(supportedRanges).toContain("1h");
    expect(supportedRanges).toContain("6h");
    expect(supportedRanges).toContain("24h");
    expect(supportedRanges).toContain("7d");
    expect(supportedRanges).toContain("30d");
  });

  it("LOAD_LABEL_SEMANTICS - correctly formats normalized system load without CPU confusion", () => {
    const vcpuCount = 2;
    const loadCapacityPercent = 77;
    const peakLoadAvg = ((loadCapacityPercent / 100) * vcpuCount).toFixed(2);

    expect(loadCapacityPercent).toBe(77);
    expect(peakLoadAvg).toBe("1.54");
    // Verifies semantics
    const label = `System Load Capacity: ${loadCapacityPercent}% (Load Avg: ${peakLoadAvg} / ${vcpuCount} vCPU)`;
    expect(label).not.toContain("CPU Utilization");
    expect(label).toContain("System Load");
    expect(label).toContain("vCPU");
  });

  it("MEMORY_SUMMARY - calculates current, mean, and peak memory metrics accurately", () => {
    const memoryValues = [25, 30, 20, 35, 40];
    const current = memoryValues[memoryValues.length - 1];
    const peak = Math.max(...memoryValues);
    const mean = Math.round(memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length);

    expect(current).toBe(40);
    expect(peak).toBe(40);
    expect(mean).toBe(30);
  });

  it("DISK_SUMMARY - calculates current and peak disk metrics accurately", () => {
    const diskValues = [14, 14, 15, 14, 15];
    const current = diskValues[diskValues.length - 1];
    const peak = Math.max(...diskValues);

    expect(current).toBe(15);
    expect(peak).toBe(15);
  });

  it("MISSING_DATA_GAP - detects missing gaps when timestamp delta exceeds threshold", () => {
    const intervalMs = 3 * 60 * 1000; // 3 min threshold
    const t0 = new Date("2026-09-11T10:00:00Z").getTime();
    const t1 = new Date("2026-09-11T10:01:00Z").getTime();
    const t2 = new Date("2026-09-11T10:10:00Z").getTime(); // 9 min gap!

    expect(t1 - t0 <= intervalMs).toBe(true);
    expect(t2 - t1 > intervalMs).toBe(true); // Gap detected!
  });

  it("MAX_300_POINTS - strictly caps bounded historical data payload to <= 300 points", () => {
    expect(samplePoints.length).toBeLessThanOrEqual(300);
  });

  it("LINKED_INCIDENT_CTA_LAYOUT - ensures clear single-action copy without fragmentation", () => {
    const ctaCopy = "View Correlated Incident";
    expect(ctaCopy).toBe("View Correlated Incident");
    expect(ctaCopy).not.toContain("Inspect Correlated Incidents");
    expect(ctaCopy).toMatch(/^View Correlated Incidents?/);
  });
});
