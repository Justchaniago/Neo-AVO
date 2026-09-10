/** Safe dashboard read models only. Never import database records into presentation. */
export type Project = {
  id: string;
  slug: string;
  name: string;
  environment: string;
  availability: string;
  operationalHealth: string;
  runtimeMode: string;
  healthStrategy: string;
  capabilities: string[];
  commandDeliveryMode: string;
  criticality: string;
  lastSeenAt: string | null;
  lastOperationalAt: string | null;
  lastSuccessfulExecutionAt: string | null;
  lastExecutionAt: string | null;
  expectedNextExecutionAt: string | null;
  staleAfterSeconds: number;
  offlineAfterSeconds: number;
  expectedIntervalSeconds: number | null;
  gracePeriodSeconds: number | null;
  targetRtoMinutes: number | null;
};
export type Activity = {
  id: string;
  eventId: string;
  type: string;
  occurredAt: string;
  receivedAt: string;
  sequence: string | null;
  runId: string | null;
  store: string | null;
  domain: string | null;
  status: string | null;
  severity: string | null;
};
export type ScopedActivity = Activity & { project: Project };
export type ProjectDetail = {
  project: Project;
  recentEvents: Activity[];
  tasks: {
    id: string;
    externalTaskId: string;
    status: string;
    currentAttempt: number;
    lastEventAt: string;
  }[];
  commands: {
    id: string;
    commandId?: string;
    capability: string;
    arguments?: Record<string, unknown> | null;
    status: string;
    requestedAt: string;
    result?: Record<string, unknown> | null;
    failureReason?: string | null;
    rejectionReason?: string | null;
  }[];
};
export type Incident = {
  id: string;
  projectId: string;
  environment: string;
  type: string;
  severity: string;
  state: string;
  reason: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  resolutionReason: string | null;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  dependencyKey: string | null;
};
export type Analysis = {
  status: string;
  summary: string | null;
  likelyCause: string | null;
  confidence: number | null;
  impact: string | null;
  recommendedActions: { capability: string; reason: string }[];
  completedAt: string | null;
  provider: string;
  model: string;
};
export type IncidentDetail = {
  incident: Incident;
  evidence: { id: string; eventId: string; linkedAt: string }[];
  analysis?: Analysis | null;
};

export function tone(value: string): string {
  if (
    ["ONLINE", "HEALTHY", "COMPLETED", "RESOLVED", "SUCCEEDED"].includes(
      value.toUpperCase(),
    )
  )
    return "lime";
  if (
    ["STALE", "DEGRADED", "WARNING", "RETRYING", "ACKNOWLEDGED"].includes(
      value.toUpperCase(),
    )
  )
    return "orange";
  if (
    [
      "OFFLINE",
      "FAILING",
      "HIGH",
      "CRITICAL",
      "FAILED",
      "EFFECT_UNCERTAIN",
    ].includes(value.toUpperCase())
  )
    return "coral";
  if (
    ["INFO", "RUNNING", "PROCESSING", "REQUESTED", "SENT"].includes(
      value.toUpperCase(),
    )
  )
    return "cyan";
  return "neutral";
}
export function globalSignal(
  projects: Project[] | undefined,
  incidents: Incident[] | undefined,
  failed: boolean,
) {
  if (failed || !projects || !incidents)
    return {
      label: failed ? "VISIBILITY LIMITED" : "CHECKING SYSTEMS",
      tone: "neutral",
    };
  if (
    incidents.some(
      (i) =>
        i.state !== "RESOLVED" && ["HIGH", "CRITICAL"].includes(i.severity),
    ) ||
    projects.some(
      (p) => p.availability === "OFFLINE" || p.operationalHealth === "FAILING",
    )
  )
    return { label: "ATTENTION REQUIRED", tone: "coral" };
  if (
    incidents.some((i) => i.state !== "RESOLVED") ||
    projects.some(
      (p) => p.availability === "STALE" || p.operationalHealth === "DEGRADED",
    )
  )
    return { label: "SIGNALS DEGRADED", tone: "orange" };
  if (!projects.length) return { label: "AWAITING TELEMETRY", tone: "neutral" };
  if (
    projects.every(
      (p) => p.availability === "ONLINE" && p.operationalHealth === "HEALTHY",
    )
  )
    return { label: "SYSTEMS NOMINAL", tone: "lime" };
  return { label: "EVIDENCE INCOMPLETE", tone: "neutral" };
}
export function eventLabel(type: string) {
  return type
    .replace(/^tele_auto\./, "")
    .replaceAll(".", " / ")
    .replaceAll("_", " ");
}
export function meaningful(event: Activity) {
  return event.type !== "system.heartbeat";
}
export function activityMatches(event: ScopedActivity, query: string) {
  return [
    event.type,
    event.eventId,
    event.runId,
    event.store,
    event.domain,
    event.status,
    event.project.name,
    event.project.environment,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query.toLowerCase());
}
export function runTimeline(
  events: ScopedActivity[],
  selected: ScopedActivity,
) {
  return events
    .filter((e) =>
      selected.runId
        ? e.runId === selected.runId &&
          e.project.id === selected.project.id &&
          e.project.environment === selected.project.environment
        : e.id === selected.id,
    )
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}
export function timestamp(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "No evidence";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
