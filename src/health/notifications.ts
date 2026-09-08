import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { createHealthTransitionNotification } from "../notifications/repository";

type Db = NodePgDatabase<typeof schema>;

const availabilityTransitions = new Set(["ONLINE->STALE", "STALE->OFFLINE", "OFFLINE->ONLINE"]);
const healthTransitions = new Set(["HEALTHY->DEGRADED", "DEGRADED->FAILING", "FAILING->HEALTHY"]);

export function isNotifiableHealthTransition(kind: "availability" | "health", previous: string, current: string) {
  return (kind === "availability" ? availabilityTransitions : healthTransitions).has(`${previous}->${current}`);
}

function severityForTransition(kind: "availability" | "health", current: string, criticality: string) {
  if (current === "OFFLINE" || current === "FAILING") return criticality === "critical" ? "CRITICAL" : "HIGH";
  if (current === "STALE" || current === "DEGRADED") return "WARNING";
  return "INFO";
}

export async function queueHealthTransitionNotification(db: Db, values: { projectId: string; projectName: string; environment: string; sourceKey: string; kind: "availability" | "health"; previous: string; current: string; criticality: string; occurredAt: Date }) {
  if (!isNotifiableHealthTransition(values.kind, values.previous, values.current)) return null;
  const label = values.kind === "availability" ? "availability" : "operational health";
  const message = `[${severityForTransition(values.kind, values.current, values.criticality)}] ${values.projectName} (${values.environment})\n${label}: ${values.previous} -> ${values.current}\nAt: ${values.occurredAt.toISOString()}`;
  return createHealthTransitionNotification(db, {
    dedupKey: `health:${values.projectId}:${values.sourceKey}:${values.kind}:${values.previous}->${values.current}`,
    severity: severityForTransition(values.kind, values.current, values.criticality),
    message,
  });
}
