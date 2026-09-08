import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { availabilityAt, healthAt } from "./derivation";
import { listProjects, updateProject } from "../projects/repository";
import { queueHealthTransitionNotification } from "./notifications";

type Db = NodePgDatabase<typeof schema>;

export async function monitorProjectHealth(db: Db, now = new Date()) {
  let transitions = 0;
  await db.transaction(async (tx) => {
    const projects = await listProjects(tx);
    for (const project of projects) {
      const nextAvailability = availabilityAt(project, now);
      const nextHealth = healthAt(project, now);
      const availabilityChanged = nextAvailability !== project.availability;
      const healthChanged = nextHealth !== project.operationalHealth;
      if (!availabilityChanged && !healthChanged) continue;
      await updateProject(tx, project.id, {
        ...(availabilityChanged ? { availability: nextAvailability } : {}),
        ...(healthChanged ? { operationalHealth: nextHealth } : {}),
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
