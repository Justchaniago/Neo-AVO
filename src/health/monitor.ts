import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { availabilityAt, businessHealthAt, healthAt } from "./derivation";
import { evaluateBusinessProof } from "./contracts";
import { listProjects, updateProject } from "../projects/repository";
import { queueHealthTransitionNotification } from "./notifications";

type Db = NodePgDatabase<typeof schema>;

export async function monitorProjectHealth(db: Db, now = new Date()) {
  let transitions = 0;
  await db.transaction(async (tx) => {
    const projects = await listProjects(tx);
    for (const project of projects) {
      const nextAvailability = availabilityAt(project, now);
      let nextHealth = healthAt(project, now);
      let nextBusiness = businessHealthAt(project, now);

      // Evaluate project events for authoritative business proof
      const events = await tx
        .select()
        .from(schema.events)
        .where(eq(schema.events.projectId, project.id))
        .orderBy(desc(schema.events.occurredAt))
        .limit(100);

      let latestSuccessAt: Date | null = null;
      let latestFailureAt: Date | null = null;

      for (const ev of events) {
        const proof = evaluateBusinessProof(project.slug, ev);
        if (proof.isValidSuccess && !latestSuccessAt) {
          latestSuccessAt = ev.occurredAt;
        }
        if (proof.isValidFailure && !latestFailureAt) {
          latestFailureAt = ev.occurredAt;
        }
      }

      const openIncidents = await tx
        .select()
        .from(schema.incidents)
        .where(and(eq(schema.incidents.projectId, project.id), ne(schema.incidents.state, "RESOLVED")));

      if (latestFailureAt && (!latestSuccessAt || latestFailureAt.getTime() > latestSuccessAt.getTime())) {
        if (openIncidents.length > 0) {
          nextBusiness = "FAILING";
        } else {
          nextBusiness = "AWAITING_VERIFICATION";
        }
      } else if (latestSuccessAt && (!latestFailureAt || latestSuccessAt.getTime() >= latestFailureAt.getTime())) {
        if (openIncidents.length > 0) {
          nextBusiness = "FAILING";
        } else {
          nextBusiness = "HEALTHY";
        }
      } else if (openIncidents.length === 0 && (project.businessHealth === "FAILING" || project.businessHealth === "DEGRADED")) {
        nextBusiness = "AWAITING_VERIFICATION";
      }

      if (openIncidents.length === 0 && (project.operationalHealth === "FAILING" || project.operationalHealth === "DEGRADED")) {
        const hasRecentSuccess = latestSuccessAt && (!latestFailureAt || latestSuccessAt >= latestFailureAt);
        nextHealth = hasRecentSuccess ? "HEALTHY" : "AWAITING_VERIFICATION";
      }

      const availabilityChanged = nextAvailability !== project.availability;
      const healthChanged = nextHealth !== project.operationalHealth;
      const businessChanged = nextBusiness !== project.businessHealth;
      if (!availabilityChanged && !healthChanged && !businessChanged) continue;
      await updateProject(tx, project.id, {
        ...(availabilityChanged ? { availability: nextAvailability } : {}),
        ...(healthChanged ? { operationalHealth: nextHealth } : {}),
        ...(businessChanged ? { businessHealth: nextBusiness } : {}),
        ...(latestSuccessAt ? { lastSuccessfulExecutionAt: latestSuccessAt } : {}),
      });
      if (availabilityChanged) {
        await queueHealthTransitionNotification(tx, { projectId: project.id, projectName: project.name, environment: project.environment, sourceKey: now.toISOString(), kind: "availability", previous: project.availability, current: nextAvailability, criticality: project.criticality, occurredAt: now });
        transitions += 1;
      }
      if (healthChanged) {
        await queueHealthTransitionNotification(tx, { projectId: project.id, projectName: project.name, environment: project.environment, sourceKey: now.toISOString(), kind: "health", previous: project.operationalHealth, current: nextHealth, criticality: project.criticality, occurredAt: now });
        transitions += 1;
      }
    }
  });
  return transitions;
}
