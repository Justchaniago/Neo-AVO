import { z } from "zod";

const objectData = z.object({}).passthrough();
const identified = (key: string) => z.object({ [key]: z.string().trim().min(1).max(200) }).passthrough();

const safeMetadataValue = z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]);
const forbiddenTelemetryKey = /telegram|message|text|secret|token|credential|authorization|private.?key|password|sheet|spreadsheet|sku|quantity/i;
const teleAutoData = z.object({
  runId: z.string().trim().min(1).max(200).optional(),
  store: z.enum(["PMS", "TP6"]).optional(),
  domain: z.enum(["PRODUCTION", "WASTE", "DAILY_SO"]).optional(),
  status: z.string().trim().min(1).max(80).optional(),
  severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]).optional(),
  executionPhase: z.string().trim().min(1).max(100).optional(),
  errorCode: z.string().trim().min(1).max(160).optional(),
  durationMs: z.number().int().nonnegative().max(86_400_000).optional(),
  metadata: z.record(z.string().max(64), safeMetadataValue).optional(),
}).strip().superRefine((value, context) => {
  for (const key of Object.keys(value.metadata ?? {})) if (forbiddenTelemetryKey.test(key)) context.addIssue({ code: "custom", path: ["metadata", key], message: "sensitive telemetry key is not allowed" });
});

const qraCommandData = z.object({
  commandId: z.string().trim().min(1).max(200),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  store: z.enum(["PMS", "TP6", "ALL"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["STARTED", "COMPLETED", "FAILED", "SKIPPED", "CONFLICT"]).optional(),
  durationMs: z.number().int().nonnegative().max(86_400_000).optional(),
  mutation: z.enum(["NONE", "EMPTY_CELLS_ONLY"]).optional(),
  reason: z.string().trim().max(500).optional(),
  completed: z.number().int().nonnegative().optional(),
  skipped: z.number().int().nonnegative().optional(),
  partial: z.number().int().nonnegative().optional(),
  conflicts: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
}).strict();

const qraReconcileStore = z.object({
  status: z.enum(["VERIFIED", "VERIFIED_PARTIAL", "MISSING_RUN", "RUN_FAILED", "RUN_IDENTITY_MISMATCH", "UNVERIFIED_RECEIPT", "WRITE_UNCONFIRMED", "SHEET_INCOMPLETE", "RESULT_MISMATCH", "CHECK_UNAVAILABLE"]),
  reason: z.enum(["RECEIPT_AND_SHEET_MATCH", "SOURCE_INCOMPLETE_METRICS_REMAIN_UNKNOWN", "QRA_PRIMARY_RUN_NOT_FOUND", "QRA_PRIMARY_RUN_FAILED", "RECEIPT_IDENTITY_MISMATCH", "SOURCE_PROOF_MISSING", "SHEET_WRITE_NOT_CONFIRMED", "VERIFIED_METRIC_MISSING_FROM_SHEET", "RECEIPT_SHEET_VALUE_MISMATCH", "SHEET_READ_FAILED", "SHEET_TAB_NOT_FOUND", "SHEET_NOT_CONFIGURED"]),
  metrics: z.array(z.enum(["sales", "adt", "qty_cup_sold", "offline_trx", "online_trx"])).max(5).optional(),
}).strict();
const qraReconcileData = z.object({
  commandId: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  store: z.literal("ALL"),
  status: z.enum(["STARTED", "COMPLETED", "FAILED"]),
  outcome: z.enum(["VERIFIED", "GAPS_FOUND", "CHECK_UNAVAILABLE"]).optional(),
  mutation: z.literal("NONE"),
  reason: z.string().trim().max(100),
  durationMs: z.number().int().nonnegative().max(86_400_000).optional(),
  completed: z.number().int().nonnegative().optional(),
  skipped: z.number().int().nonnegative().optional(),
  conflicts: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
  stores: z.object({ PMS: qraReconcileStore, TP6: qraReconcileStore }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "COMPLETED" && (!value.outcome || !value.stores)) context.addIssue({ code: "custom", message: "completed_reconcile_requires_outcome_and_store_results" });
});

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
  "qra.audit.started": qraCommandData,
  "qra.audit.completed": qraCommandData,
  "qra.audit.failed": qraCommandData,
  "qra.reconcile.started": qraReconcileData,
  "qra.reconcile.completed": qraReconcileData,
  "qra.reconcile.failed": qraReconcileData,
  "qra.resolve_missing_dates.started": qraCommandData,
  "qra.resolve_missing_dates.date_completed": qraCommandData,
  "qra.resolve_missing_dates.date_conflict": qraCommandData,
  "qra.resolve_missing_dates.completed": qraCommandData,
  "qra.resolve_missing_dates.failed": qraCommandData,
  "tele_auto.run.received": teleAutoData,
  "tele_auto.run.processing": teleAutoData,
  "tele_auto.run.needs_clarification": teleAutoData,
  "tele_auto.run.awaiting_confirmation": teleAutoData,
  "tele_auto.run.completed": teleAutoData,
  "tele_auto.run.failed": teleAutoData,
  "tele_auto.run.effect_uncertain": teleAutoData,
  "tele_auto.worker.recovery": teleAutoData,
  "tele_auto.telegram.delivery_failed": teleAutoData,
  "tele_auto.sheets.schema_mismatch": teleAutoData,
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
