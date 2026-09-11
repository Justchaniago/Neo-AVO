import { describe, expect, it } from "vitest";
import { globalSignal, runTimeline, type Incident, type Project, type ScopedActivity } from "../app/ui/model";

const project = { id: "fixture-project", environment: "test", availability: "ONLINE", operationalHealth: "HEALTHY" } as Project;
const incident = { id: "fixture-incident", state: "OPEN", severity: "WARNING" } as Incident;

describe("operational UI truth", () => {
  it("does not label missing or failed visibility healthy", () => {
    expect(globalSignal(undefined, [], false).tone).toBe("neutral");
    expect(globalSignal([project], [], true).label).toBe("VISIBILITY LIMITED");
    expect(globalSignal([], [], false).label).toBe("AWAITING TELEMETRY");
  });
  it("keeps online availability distinct from degraded health", () => {
    expect(globalSignal([{ ...project, operationalHealth: "DEGRADED" }], [], false).tone).toBe("orange");
    expect(globalSignal([{ ...project, operationalHealth: "UNKNOWN" }], [], false).tone).toBe("neutral");
    expect(globalSignal([project], [], false).tone).toBe("lime");
  });
  it("distinguishes warnings from critical incidents, including internal incidents with no projects", () => {
    expect(globalSignal([project], [incident], false).tone).toBe("orange");
    expect(globalSignal([], [{ ...incident, severity: "CRITICAL" }], false).tone).toBe("coral");
    expect(globalSignal([project], [{ ...incident, state: "RESOLVED" }], false).tone).toBe("lime");
  });
  it("prioritizes global status: ATTENTION REQUIRED > SIGNALS DEGRADED > RECOVERY IN PROGRESS > VERIFICATION PENDING > SYSTEMS NOMINAL", () => {
    const awaitingProject = { ...project, operationalHealth: "AWAITING_VERIFICATION", businessHealth: "AWAITING_VERIFICATION" };
    expect(globalSignal([awaitingProject], [], false)).toEqual({ label: "VERIFICATION PENDING", tone: "cyan" });

    const recoveringProject = { ...project, operationalHealth: "RECOVERING" };
    expect(globalSignal([recoveringProject], [], false)).toEqual({ label: "RECOVERY IN PROGRESS", tone: "cyan" });

    // Historical resolved incidents alone do NOT force attention or degraded status
    expect(globalSignal([awaitingProject], [{ ...incident, state: "RESOLVED" }], false)).toEqual({ label: "VERIFICATION PENDING", tone: "cyan" });
  });
  it("does not mix run IDs across projects or invent missing lifecycle events", () => {
    const selected = { id: "one", runId: "shared", occurredAt: "2026-09-09T01:00:00Z", project } as ScopedActivity;
    const other = { ...selected, id: "two", project: { ...project, id: "other" } };
    expect(runTimeline([selected, other], selected)).toEqual([selected]);
  });
});
