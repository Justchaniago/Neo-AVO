import { z } from "zod";

const objectData = z.object({}).passthrough();
const identified = (key: string) => z.object({ [key]: z.string().trim().min(1).max(200) }).passthrough();

export const eventDataSchemas = {
  "system.heartbeat": objectData,
  "project.started": objectData,
  "project.stopped": objectData,
  "task.started": identified("taskId"),
  "task.completed": identified("taskId"),
  "task.failed": identified("taskId"),
  "task.cancelled": identified("taskId"),
  "task.retrying": identified("taskId"),
  "agent.started": identified("agentId"),
  "agent.completed": identified("agentId"),
  "agent.blocked": identified("agentId"),
  "agent.failed": identified("agentId"),
  "dependency.degraded": identified("dependency"),
  "dependency.recovered": identified("dependency"),
  "deployment.completed": identified("deploymentId"),
  "deployment.failed": identified("deploymentId"),
  "command.acknowledged": identified("commandId"),
  "command.completed": identified("commandId"),
  "command.failed": identified("commandId"),
} as const;

export const eventTypes = Object.keys(eventDataSchemas) as [keyof typeof eventDataSchemas, ...(keyof typeof eventDataSchemas)[]];

const eventBaseSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().trim().min(1).max(200),
  projectId: z.string().trim().min(1).max(200),
  environment: z.string().trim().min(1).max(64),
  type: z.string().trim().min(1).max(100),
  occurredAt: z.string().datetime({ offset: true }),
  sequence: z.union([z.string().min(1).max(200), z.number().int().nonnegative()]).optional(),
  data: z.unknown(),
}).passthrough();

export const eventBatchSchema = z.object({
  events: z.array(eventBaseSchema).min(1).max(100),
}).passthrough();

export type CanonicalEvent = z.infer<typeof eventBaseSchema>;

export function validateEventData(event: CanonicalEvent) {
  const schema = eventDataSchemas[event.type as keyof typeof eventDataSchemas];
  if (!schema) return { ok: false as const, error: "unknown_event_type" };
  const parsed = schema.safeParse(event.data);
  if (!parsed.success) return { ok: false as const, error: "invalid_event_data", details: parsed.error.flatten() };
  return { ok: true as const, data: parsed.data };
}
