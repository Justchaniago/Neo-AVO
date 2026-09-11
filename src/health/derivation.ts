import { createHash } from "node:crypto";

export const availabilityStates = ["ONLINE", "STALE", "OFFLINE", "UNKNOWN"] as const;
export const operationalHealthStates = ["HEALTHY", "DEGRADED", "FAILING", "RECOVERING", "UNKNOWN"] as const;
export const businessHealthStates = ["HEALTHY", "DEGRADED", "FAILING", "RECOVERING", "UNKNOWN"] as const;

export type Availability = (typeof availabilityStates)[number];
export type OperationalHealth = (typeof operationalHealthStates)[number];
export type BusinessHealth = (typeof businessHealthStates)[number];

export type HealthProject = {
  runtimeMode: string;
  healthStrategy: string;
  availability: string;
  operationalHealth: string;
  businessHealth?: string;
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
  const message = typeof record.errorCode === "string" ? record.errorCode : typeof record.errorSignature === "string" ? record.errorSignature : typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : null;
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

/** Business health is based on expected effects, never on HTTP/runtime reachability. */
export function businessHealthAt(project: Pick<HealthProject, "businessHealth" | "lastSuccessfulExecutionAt" | "expectedNextExecutionAt" | "gracePeriodSeconds">, now: Date): BusinessHealth {
  if (project.businessHealth && businessHealthStates.includes(project.businessHealth as BusinessHealth) && project.businessHealth !== "UNKNOWN") return project.businessHealth as BusinessHealth;
  if (project.expectedNextExecutionAt && project.gracePeriodSeconds !== null && now.getTime() > project.expectedNextExecutionAt.getTime() + project.gracePeriodSeconds * 1000 && (!project.lastSuccessfulExecutionAt || project.lastSuccessfulExecutionAt < project.expectedNextExecutionAt)) return "DEGRADED";
  return "UNKNOWN";
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
  if (event.type === "dependency.degraded") return { ...base, operationalHealth: "DEGRADED", businessHealth: "DEGRADED", lastOperationalAt: eventTime };
  if (event.type === "dependency.recovered") return { ...base, operationalHealth: "RECOVERING", businessHealth: "RECOVERING", lastOperationalAt: eventTime };
  if (event.type === "incident.manually_resolved") {
    const op = project.operationalHealth === "FAILING" || project.operationalHealth === "DEGRADED" ? "RECOVERING" : project.operationalHealth;
    const biz = project.businessHealth === "FAILING" || project.businessHealth === "DEGRADED" ? "RECOVERING" : project.businessHealth;
    return { ...base, operationalHealth: op, businessHealth: biz, lastOperationalAt: eventTime };
  }
  if (event.type === "task.failed" || event.type === "agent.failed" || event.type === "deployment.failed") return { ...base, lastExecutionAt: eventTime, lastFailureAt: eventTime, lastErrorSignature: failureSignature(event.data), operationalHealth: "FAILING", businessHealth: "FAILING", lastOperationalAt: eventTime, availability: "ONLINE" };
  if (event.type === "task.retrying" || event.type === "agent.blocked") return { ...base, lastExecutionAt: eventTime, operationalHealth: "DEGRADED", businessHealth: "DEGRADED", lastOperationalAt: eventTime, availability: "ONLINE" };
  if (event.type === "task.completed" || event.type === "agent.completed" || event.type === "deployment.completed") return { ...base, lastExecutionAt: eventTime, lastSuccessfulExecutionAt: eventTime, expectedNextExecutionAt: project.expectedIntervalSeconds ? new Date(eventTime.getTime() + project.expectedIntervalSeconds * 1000) : project.expectedNextExecutionAt, operationalHealth: "HEALTHY", businessHealth: "HEALTHY", lastOperationalAt: eventTime, availability: "ONLINE" };
  if (event.type.startsWith("tele_auto.")) {
    const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
    const status = typeof data.status === "string" ? data.status.toLowerCase() : "";
    const baseTeleAuto = { ...base, lastSeenAt: eventTime, lastOperationalAt: eventTime, lastExecutionAt: eventTime, availability: "ONLINE" as const };
    if (event.type === "tele_auto.run.failed" || event.type === "tele_auto.run.effect_uncertain" || event.type === "tele_auto.sheets.schema_mismatch") return { ...baseTeleAuto, lastFailureAt: eventTime, lastErrorSignature: failureSignature(event.data), operationalHealth: event.type === "tele_auto.run.effect_uncertain" ? "FAILING" as const : "DEGRADED" as const, businessHealth: "FAILING" as const };
    if (event.type === "tele_auto.telegram.delivery_failed" || (event.type === "tele_auto.worker.recovery" && ["failed", "failure", "unsuccessful"].includes(status))) return { ...baseTeleAuto, lastFailureAt: eventTime, lastErrorSignature: failureSignature(event.data), operationalHealth: "DEGRADED" as const, businessHealth: "DEGRADED" as const };
    if (event.type === "tele_auto.worker.recovery" && ["recovered", "completed", "success", "successful"].includes(status)) return { ...baseTeleAuto, operationalHealth: "RECOVERING" as const, businessHealth: "RECOVERING" as const };
    if (event.type === "tele_auto.run.completed") return { ...baseTeleAuto, lastSuccessfulExecutionAt: eventTime, operationalHealth: "HEALTHY" as const, businessHealth: "HEALTHY" as const };
    return { ...baseTeleAuto, operationalHealth: project.operationalHealth === "UNKNOWN" ? "HEALTHY" as const : project.operationalHealth as "HEALTHY" | "DEGRADED" | "FAILING" | "RECOVERING" | "UNKNOWN" };
  }
  if (event.type.startsWith("task.") || event.type.startsWith("agent.") || event.type.startsWith("deployment.")) return { ...base, lastExecutionAt: eventTime, lastOperationalAt: eventTime, availability: "ONLINE" };
  return base;
}
