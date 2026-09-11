/** Safe dashboard read models only. Never import database records into presentation. */
export type Project = {
  id: string;
  slug: string;
  name: string;
  environment: string;
  availability: string;
  operationalHealth: string;
  businessHealth: string;
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
  incidents?: Incident[];
  expectedExecutions?: Record<string, unknown>[];
  dependencies?: Record<string, unknown>[];
  changes?: Record<string, unknown>[];
  timeline?: { items: TimelineItem[]; nextBefore: string | null };
};
export type TimelineItem = { timestamp: string; kind: "EVENT" | "TASK" | "EXPECTED_EXECUTION" | "CHANGE" | "INCIDENT" | "AI_ANALYSIS" | "RECOVERY" | "RESOLUTION"; severity: string | null; status: string | null; title: string; summary: string; sourceId: string; projectId: string; metadataSafe: Record<string, string | number | null> };
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
  facts?: string[];
  hypotheses?: { statement: string; confidence: "LOW" | "MEDIUM" | "HIGH" }[];
  correlations?: string[];
  relevantRepositoryFiles?: string[];
  recommendedChecks?: string[];
  safetyConstraints?: string[];
  completedAt: string | null;
  provider: string;
  model: string;
};
export type IncidentDetail = {
  incident: Incident;
  evidence: { id: string; eventId: string; linkedAt: string }[];
  analysis?: Analysis | null;
  timeline?: { items: TimelineItem[]; nextBefore: string | null };
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
    [
      "INFO",
      "RUNNING",
      "PROCESSING",
      "REQUESTED",
      "SENT",
      "RECOVERING",
      "AWAITING_VERIFICATION",
      "AWAITING VERIFICATION",
      "VERIFICATION_PENDING",
      "VERIFICATION PENDING",
    ].includes(value.toUpperCase())
  )
    return "cyan";
  return "neutral";
}
export function getTelemetryFreshness(
  observedAtStr: string | null | undefined,
  nowMs: number = Date.now()
): "LIVE" | "STALE" | "UNKNOWN" {
  if (!observedAtStr) return "UNKNOWN";
  const observedMs = Date.parse(observedAtStr);
  if (isNaN(observedMs)) return "UNKNOWN";
  const ageSeconds = Math.max(0, (nowMs - observedMs) / 1000);
  if (ageSeconds < 90) return "LIVE";
  if (ageSeconds <= 180) return "STALE";
  return "UNKNOWN";
}

export type InfraSummary = {
  latestSnapshot?: { observedAt?: string; serviceState?: { pressureState?: string } } | null;
  monitoredServices?: { status?: string }[];
} | null;

export function globalSignal(
  projects: Project[] | undefined,
  incidents: Incident[] | undefined,
  failed: boolean,
  infra?: InfraSummary
) {
  if (failed || !projects || !incidents)
    return {
      label: failed ? "VISIBILITY LIMITED" : "CHECKING SYSTEMS",
      tone: "neutral",
    };

  const hasCriticalIncident = incidents.some(
    (i) => i.state !== "RESOLVED" && ["HIGH", "CRITICAL"].includes(i.severity)
  );
  const hasFailingProject = projects.some(
    (p) => p.availability === "OFFLINE" || p.operationalHealth === "FAILING" || p.businessHealth === "FAILING"
  );
  const hasInfraCritical = infra?.latestSnapshot?.serviceState?.pressureState === "CRITICAL" ||
    infra?.monitoredServices?.some((s) => s.status === "FAILED");

  if (hasCriticalIncident || hasFailingProject || hasInfraCritical)
    return { label: "ATTENTION REQUIRED", tone: "coral" };

  const hasUnresolvedIncident = incidents.some((i) => i.state !== "RESOLVED");
  const hasDegradedProject = projects.some(
    (p) => p.availability === "STALE" || p.operationalHealth === "DEGRADED" || p.businessHealth === "DEGRADED"
  );
  const infraFreshness = infra?.latestSnapshot?.observedAt
    ? getTelemetryFreshness(infra.latestSnapshot.observedAt)
    : undefined;
  const hasInfraDegraded = infra?.latestSnapshot?.serviceState?.pressureState === "WARNING" ||
    infraFreshness === "STALE";

  if (hasUnresolvedIncident || hasDegradedProject || hasInfraDegraded)
    return { label: "SIGNALS DEGRADED", tone: "orange" };

  const hasRecoveringProject = projects.some(
    (p) => p.operationalHealth === "RECOVERING" || p.businessHealth === "RECOVERING"
  );
  if (hasRecoveringProject)
    return { label: "RECOVERY IN PROGRESS", tone: "cyan" };

  const hasAwaitingVerificationProject = projects.some(
    (p) => p.operationalHealth === "AWAITING_VERIFICATION" || p.businessHealth === "AWAITING_VERIFICATION"
  );
  if (hasAwaitingVerificationProject)
    return { label: "VERIFICATION PENDING", tone: "cyan" };

  if (!projects.length) return { label: "AWAITING TELEMETRY", tone: "neutral" };

  const allProjectsNominal = projects.every(
    (p) =>
      p.availability === "ONLINE" &&
      p.operationalHealth === "HEALTHY" &&
      (!p.businessHealth || p.businessHealth === "HEALTHY" || p.businessHealth === "UNKNOWN")
  );
  const infraNominal = !infra || (infraFreshness === "LIVE" && (infra.latestSnapshot?.serviceState?.pressureState || "NORMAL") === "NORMAL");

  if (allProjectsNominal && infraNominal)
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
