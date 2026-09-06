export const incidentStates = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;
export const incidentSeverities = ["INFO", "WARNING", "HIGH", "CRITICAL"] as const;

export type IncidentState = (typeof incidentStates)[number];
export type IncidentSeverity = (typeof incidentSeverities)[number];

export type IncidentProject = {
  id: string;
  environment: string;
  criticality: string;
  expectedNextExecutionAt: Date | null;
  gracePeriodSeconds: number | null;
  lastSuccessfulExecutionAt: Date | null;
};

export type IncidentEvent = {
  id: string;
  type: string;
  occurredAt: Date;
  data: unknown;
};

export type IncidentTrigger = {
  type: string;
  dedupKey: string;
  severity: IncidentSeverity;
  reason: string;
  dependencyKey?: string;
  taskId?: string;
  errorSignature?: string;
};

export function shouldNotifyImmediately(severity: IncidentSeverity) {
  return severity === "HIGH" || severity === "CRITICAL";
}

export function incidentTrigger(project: IncidentProject, event: IncidentEvent, now: Date): IncidentTrigger | null {
  const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
  const projectScope = `${project.id}:${project.environment}`;
  if (event.type === "task.failed") {
    const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
    const message = typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : "task failure";
    const errorSignature = typeof data.errorSignature === "string" ? data.errorSignature : message;
    return { type: "TASK_FAILURE", dedupKey: `${projectScope}:task-failure:${errorSignature}`, severity: "HIGH", reason: message, taskId, errorSignature };
  }
  if (event.type === "event.quarantined") return { type: "POISON_EVENT", dedupKey: `${projectScope}:poison:${event.id}`, severity: "CRITICAL", reason: "Operational event quarantined after repeated processing failure" };
  if (event.type === "project.stopped") return { type: "PROJECT_OFFLINE", dedupKey: `${projectScope}:project-offline`, severity: project.criticality === "critical" ? "CRITICAL" : "HIGH", reason: "Project reported stopped" };
  if (event.type === "dependency.degraded") {
    const dependencyKey = typeof data.dependency === "string" ? data.dependency : "unknown-dependency";
    return { type: "DEPENDENCY_DEGRADED", dedupKey: `${projectScope}:dependency:${dependencyKey}`, severity: "HIGH", reason: `Dependency degraded: ${dependencyKey}`, dependencyKey };
  }
  if (event.type.startsWith("task.") && project.expectedNextExecutionAt && project.gracePeriodSeconds !== null && now.getTime() > project.expectedNextExecutionAt.getTime() + project.gracePeriodSeconds * 1000 && (!project.lastSuccessfulExecutionAt || project.lastSuccessfulExecutionAt < project.expectedNextExecutionAt)) {
    return { type: "EXPECTED_RUN_OVERDUE", dedupKey: `${projectScope}:expected-run-overdue`, severity: "HIGH", reason: "Expected execution is overdue" };
  }
  return null;
}

export function recoveryKey(project: IncidentProject, event: IncidentEvent) {
  const scope = `${project.id}:${project.environment}`;
  if (event.type === "dependency.recovered") {
    const dependency = event.data && typeof event.data === "object" && typeof (event.data as Record<string, unknown>).dependency === "string" ? (event.data as Record<string, string>).dependency : "unknown-dependency";
    return `${scope}:dependency:${dependency}`;
  }
  if (event.type === "project.started") return `${scope}:project-offline`;
  if (event.type === "task.completed" && project.expectedNextExecutionAt) return `${scope}:expected-run-overdue`;
  return null;
}
