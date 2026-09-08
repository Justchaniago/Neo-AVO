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
  if (event.type.startsWith("tele_auto.")) {
    const runId = typeof data.runId === "string" ? data.runId : "unknown-run";
    const errorCode = typeof data.errorCode === "string" ? data.errorCode : "tele_auto_operational_failure";
    const severity = data.severity === "CRITICAL" ? "CRITICAL" : data.severity === "WARNING" ? "WARNING" : "HIGH";
    if (event.type === "tele_auto.run.effect_uncertain") return { type: "TELE_AUTO_EFFECT_UNCERTAIN", dedupKey: `${projectScope}:tele-auto:effect-uncertain:${runId}`, severity: "CRITICAL", reason: `Tele Auto effect is uncertain (${errorCode})`, errorSignature: errorCode };
    if (event.type === "tele_auto.sheets.schema_mismatch") return { type: "TELE_AUTO_SHEETS_SCHEMA_MISMATCH", dedupKey: `${projectScope}:tele-auto:sheets-schema:${errorCode}`, severity, reason: `Tele Auto Sheets schema mismatch (${errorCode})`, errorSignature: errorCode };
    if (event.type === "tele_auto.telegram.delivery_failed") return { type: "TELE_AUTO_TELEGRAM_DELIVERY_FAILED", dedupKey: `${projectScope}:tele-auto:telegram:${errorCode}`, severity, reason: `Tele Auto Telegram delivery failed (${errorCode})`, errorSignature: errorCode };
    if (event.type === "tele_auto.worker.recovery" && ["failed", "failure", "unsuccessful"].includes(typeof data.status === "string" ? data.status.toLowerCase() : "")) return { type: "TELE_AUTO_WORKER_RECOVERY_FAILED", dedupKey: `${projectScope}:tele-auto:worker-recovery:${errorCode}`, severity, reason: `Tele Auto worker recovery failed (${errorCode})`, errorSignature: errorCode };
    if (event.type === "tele_auto.run.failed") return { type: "TELE_AUTO_RUN_FAILURE", dedupKey: `${projectScope}:tele-auto:run-failed:${errorCode}`, severity, reason: `Tele Auto run failed (${errorCode})`, errorSignature: errorCode };
  }
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
  if (event.type === "tele_auto.run.completed" && project.expectedNextExecutionAt) return `${scope}:expected-run-overdue`;
  return null;
}
