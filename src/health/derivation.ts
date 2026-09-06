import { createHash } from "node:crypto";

export const availabilityStates = ["ONLINE", "STALE", "OFFLINE", "UNKNOWN"] as const;
export const operationalHealthStates = ["HEALTHY", "DEGRADED", "FAILING", "UNKNOWN"] as const;

export type Availability = (typeof availabilityStates)[number];
export type OperationalHealth = (typeof operationalHealthStates)[number];

export type HealthProject = {
  runtimeMode: string;
  healthStrategy: string;
  availability: string;
  operationalHealth: string;
  staleAfterSeconds: number;
  offlineAfterSeconds: number;
  expectedNextExecutionAt: Date | null;
  gracePeriodSeconds: number | null;
  expectedIntervalSeconds: number | null;
  lastSeenAt: Date | null;
  lastOperationalAt: Date | null;
  lastSuccessfulExecutionAt: Date | null;
  lastExecutionAt: Date | null;
  lastFailureAt: Date | null;
  lastErrorSignature: string | null;
  lastHealthEventAt: Date | null;
};

export type HealthEvent = { type: string; occurredAt: Date; data: unknown };

function failureSignature(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : null;
  return message ? createHash("sha256").update(message).digest("hex") : null;
}

export function availabilityAt(project: HealthProject, now: Date): Availability {
  if (project.healthStrategy === "heartbeat") {
    if (!project.lastSeenAt) return "UNKNOWN";
    const ageSeconds = Math.max(0, (now.getTime() - project.lastSeenAt.getTime()) / 1000);
    if (ageSeconds <= project.staleAfterSeconds) return "ONLINE";
    if (ageSeconds <= project.offlineAfterSeconds) return "STALE";
    return "OFFLINE";
  }
  if (project.healthStrategy === "execution_based") {
    if (!project.lastExecutionAt && !project.lastOperationalAt) return "UNKNOWN";
    if (project.runtimeMode === "on_demand") return "ONLINE";
    if (project.expectedNextExecutionAt && project.gracePeriodSeconds !== null && now.getTime() > project.expectedNextExecutionAt.getTime() + project.gracePeriodSeconds * 1000) return "STALE";
    return "ONLINE";
  }
  return project.availability === "ONLINE" || project.availability === "OFFLINE" ? project.availability as Availability : "UNKNOWN";
}

export function healthAt(project: HealthProject, now: Date): OperationalHealth {
  if (project.healthStrategy === "execution_based" && project.expectedNextExecutionAt && project.gracePeriodSeconds !== null && now.getTime() > project.expectedNextExecutionAt.getTime() + project.gracePeriodSeconds * 1000) return "DEGRADED";
  return project.operationalHealth as OperationalHealth;
}

export function deriveHealthFromEvent(project: HealthProject, event: HealthEvent): Partial<HealthProject> {
  const eventTime = event.occurredAt;
  if (project.lastHealthEventAt && eventTime.getTime() <= project.lastHealthEventAt.getTime()) return {};

  const base: Partial<HealthProject> = { lastHealthEventAt: eventTime };
  if (event.type === "system.heartbeat") {
    return { ...base, lastSeenAt: eventTime, availability: availabilityAt({ ...project, lastSeenAt: eventTime }, eventTime), lastOperationalAt: eventTime };
  }
  if (event.type === "project.started") return { ...base, lastSeenAt: eventTime, lastOperationalAt: eventTime, availability: "ONLINE" };
  if (event.type === "project.stopped") return { ...base, lastSeenAt: eventTime, lastOperationalAt: eventTime, availability: "OFFLINE" };
  if (event.type === "dependency.degraded") return { ...base, operationalHealth: "DEGRADED", lastOperationalAt: eventTime };
  if (event.type === "dependency.recovered") return { ...base, operationalHealth: "HEALTHY", lastOperationalAt: eventTime };
  if (event.type === "task.failed" || event.type === "agent.failed" || event.type === "deployment.failed") return { ...base, lastExecutionAt: eventTime, lastFailureAt: eventTime, lastErrorSignature: failureSignature(event.data), operationalHealth: "FAILING", lastOperationalAt: eventTime, availability: "ONLINE" };
  if (event.type === "task.retrying" || event.type === "agent.blocked") return { ...base, lastExecutionAt: eventTime, operationalHealth: "DEGRADED", lastOperationalAt: eventTime, availability: "ONLINE" };
  if (event.type === "task.completed" || event.type === "agent.completed" || event.type === "deployment.completed") return { ...base, lastExecutionAt: eventTime, lastSuccessfulExecutionAt: eventTime, expectedNextExecutionAt: project.expectedIntervalSeconds ? new Date(eventTime.getTime() + project.expectedIntervalSeconds * 1000) : project.expectedNextExecutionAt, operationalHealth: "HEALTHY", lastOperationalAt: eventTime, availability: "ONLINE" };
  if (event.type.startsWith("task.") || event.type.startsWith("agent.") || event.type.startsWith("deployment.")) return { ...base, lastExecutionAt: eventTime, lastOperationalAt: eventTime, availability: "ONLINE" };
  return base;
}
