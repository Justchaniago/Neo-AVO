import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { and, eq, ne } from "drizzle-orm";
import { availabilityAt, businessHealthAt, healthAt } from "./derivation";
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

      if (project.operationalHealth === "FAILING" || project.businessHealth === "FAILING" || project.operationalHealth === "DEGRADED" || project.businessHealth === "DEGRADED") {
        const openIncidents = await tx.select().from(schema.incidents).where(and(eq(schema.incidents.projectId, project.id), ne(schema.incidents.state, "RESOLVED")));
        if (openIncidents.length === 0) {
          const hasRecentSuccessAfterFailure = project.lastSuccessfulExecutionAt && project.lastFailureAt && project.lastSuccessfulExecutionAt > project.lastFailureAt;
          const target = hasRecentSuccessAfterFailure ? "HEALTHY" : "AWAITING_VERIFICATION";
          if (project.operationalHealth === "FAILING" || project.operationalHealth === "DEGRADED") nextHealth = target;
          if (project.businessHealth === "FAILING" || project.businessHealth === "DEGRADED") nextBusiness = target;
        }
      }

      const availabilityChanged = nextAvailability !== project.availability;
      const healthChanged = nextHealth !== project.operationalHealth;
      const businessChanged = nextBusiness !== project.businessHealth;
      if (!availabilityChanged && !healthChanged && !businessChanged) continue;
      await updateProject(tx, project.id, {
        ...(availabilityChanged ? { availability: nextAvailability } : {}),
        ...(healthChanged ? { operationalHealth: nextHealth } : {}),
        ...(businessChanged ? { businessHealth: nextBusiness } : {}),
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
