import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { deriveHealthFromEvent } from "../health/derivation";
import { findProjectById, updateProject } from "../projects/repository";
import { recordIncidentForEvent, resolveIncidentForEvent } from "../incidents/usecases";
import { findTask, markEventFailed, markEventProcessed, upsertTask } from "./repository";
import { projectTaskEvent } from "../tasks/projection";
import { log } from "../observability/logger";
import { queueHealthTransitionNotification } from "../health/notifications";

type Db = NodePgDatabase<typeof schema>;
export const MAX_PROCESSING_ATTEMPTS = 3;

export async function processClaimedEvent(db: Db, event: typeof schema.events.$inferSelect) {
  if (!event.claimToken) throw new Error("event has no claim token");
  try {
    await db.transaction(async (tx) => {
      if (event.type.startsWith("task.")) {
        const taskId = typeof event.data === "object" && event.data !== null && "taskId" in event.data && typeof event.data.taskId === "string" ? event.data.taskId : null;
        if (!taskId) throw new Error("invalid task event data: taskId is required");
        const current = await findTask(tx, event.projectId, event.environment, taskId);
        const projection = projectTaskEvent(current, { type: event.type, occurredAt: event.occurredAt, sequence: event.sequence, data: event.data }, event.projectId, event.environment);
        if (projection) await upsertTask(tx, projection);
      }
      const project = await findProjectById(tx, event.projectId);
      if (!project) throw new Error("event project no longer exists");
      const healthChanges = deriveHealthFromEvent(project, { type: event.type, occurredAt: event.occurredAt, data: event.data });
      if (Object.keys(healthChanges).length > 0) await updateProject(tx, project.id, healthChanges);
      const currentProject = await findProjectById(tx, event.projectId);
      if (!currentProject) throw new Error("event project no longer exists");
      if (project.availability !== currentProject.availability) await queueHealthTransitionNotification(tx, { projectId: project.id, projectName: project.name, environment: project.environment, sourceKey: event.id, kind: "availability", previous: project.availability, current: currentProject.availability, criticality: project.criticality, occurredAt: event.occurredAt });
      if (project.operationalHealth !== currentProject.operationalHealth) await queueHealthTransitionNotification(tx, { projectId: project.id, projectName: project.name, environment: project.environment, sourceKey: event.id, kind: "health", previous: project.operationalHealth, current: currentProject.operationalHealth, criticality: project.criticality, occurredAt: event.occurredAt });
      await resolveIncidentForEvent(tx, currentProject, { id: event.id, type: event.type, occurredAt: event.occurredAt, data: event.data }, `Recovered by ${event.type}`);
      await recordIncidentForEvent(tx, currentProject, { id: event.id, type: event.type, occurredAt: event.occurredAt, data: event.data });
      const processed = await markEventProcessed(tx, event.id, event.claimToken!);
      if (!processed) throw new Error("event claim was lost before completion");
    });
    return { status: "processed" as const };
  } catch (error) {
    log("error", "worker", "event_processing_failed", { eventId: event.eventId, projectId: event.projectId, environment: event.environment, errorClass: error instanceof Error ? error.name : "unknown" });
    await db.transaction(async (tx) => {
      const failed = await markEventFailed(tx, event.id, event.claimToken!, event.processingAttempts, error, MAX_PROCESSING_ATTEMPTS);
      if (failed?.quarantinedAt) {
        log("error", "worker", "event_quarantined", { eventId: event.eventId, projectId: event.projectId, environment: event.environment });
        const project = await findProjectById(tx, event.projectId);
        if (project) await recordIncidentForEvent(tx, project, { id: event.id, type: "event.quarantined", occurredAt: new Date(), data: { eventId: event.eventId, originalType: event.type } });
      }
    });
    return { status: event.processingAttempts >= MAX_PROCESSING_ATTEMPTS ? "quarantined" as const : "retryable_failure" as const, error };
  }
}
