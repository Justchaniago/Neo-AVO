import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** M0 keeps only the database connectivity seam; domain tables start in M1. */
export const healthChecks = pgTable("health_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  environment: text("environment").notNull(),
  runtimeMode: text("runtime_mode").notNull(),
  healthStrategy: text("health_strategy").notNull(),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  commandDeliveryMode: text("command_delivery_mode").notNull().default("PULL"),
  commandEndpointUrl: text("command_endpoint_url"),
  commandAuthCiphertext: text("command_auth_ciphertext"),
  commandAuthIv: text("command_auth_iv"),
  commandAuthTag: text("command_auth_tag"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  availability: text("availability").notNull().default("UNKNOWN"),
  operationalHealth: text("operational_health").notNull().default("UNKNOWN"),
  businessHealth: text("business_health").notNull().default("UNKNOWN"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lastOperationalAt: timestamp("last_operational_at", { withTimezone: true }),
  lastSuccessfulExecutionAt: timestamp("last_successful_execution_at", { withTimezone: true }),
  lastExecutionAt: timestamp("last_execution_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastErrorSignature: text("last_error_signature"),
  expectedNextExecutionAt: timestamp("expected_next_execution_at", { withTimezone: true }),
  staleAfterSeconds: integer("stale_after_seconds").notNull().default(300),
  offlineAfterSeconds: integer("offline_after_seconds").notNull().default(900),
  expectedIntervalSeconds: integer("expected_interval_seconds"),
  gracePeriodSeconds: integer("grace_period_seconds"),
  criticality: text("criticality").notNull().default("normal"),
  targetRtoMinutes: integer("target_rto_minutes"),
  lastHealthEventAt: timestamp("last_health_event_at", { withTimezone: true }),
});

export const projectCredentials = pgTable(
  "project_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => ({ projectEnvironmentIdx: uniqueIndex("project_credentials_project_environment_idx").on(table.projectId, table.environment).where(sql`${table.revokedAt} is null`) }),
);

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: text("event_id").notNull().unique(),
  schemaVersion: integer("schema_version").notNull(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  environment: text("environment").notNull(),
  type: text("type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  sequence: text("sequence"),
  data: jsonb("data").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processingAttempts: integer("processing_attempts").notNull().default(0),
  processingError: text("processing_error"),
  quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
  claimToken: text("claim_token"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    environment: text("environment").notNull(),
    externalTaskId: text("external_task_id").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    currentAttempt: integer("current_attempt").notNull().default(0),
    currentRunId: text("current_run_id"),
    lastSequence: text("last_sequence"),
    lastError: text("last_error"),
    lastErrorSignature: text("last_error_signature"),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ taskScopeIdx: uniqueIndex("tasks_project_environment_external_id_idx").on(table.projectId, table.environment, table.externalTaskId) }),
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    environment: text("environment").notNull(),
    type: text("type").notNull(),
    dedupKey: text("dedup_key").notNull(),
    severity: text("severity").notNull(),
    state: text("state").notNull().default("OPEN"),
    reason: text("reason").notNull(),
    dependencyKey: text("dependency_key"),
    taskId: text("task_id"),
    errorSignature: text("error_signature"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionReason: text("resolution_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ incidentDedupIdx: uniqueIndex("incidents_open_dedup_idx").on(table.projectId, table.environment, table.dedupKey, table.state) }),
);

export const incidentEvents = pgTable(
  "incident_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    incidentId: uuid("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ incidentEventIdx: uniqueIndex("incident_events_incident_event_idx").on(table.incidentId, table.eventId) }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    incidentId: uuid("incident_id").references(() => incidents.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("telegram"),
    kind: text("kind").notNull(),
    dedupKey: text("dedup_key"),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("PENDING"),
    message: text("message").notNull(),
    deliveryAttempts: integer("delivery_attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimToken: text("claim_token"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    notificationKindIdx: uniqueIndex("notifications_incident_kind_idx").on(table.incidentId, table.kind),
    notificationDedupIdx: uniqueIndex("notifications_dedup_key_idx").on(table.dedupKey).where(sql`${table.dedupKey} is not null`),
  }),
);

export const opsAnalyses = pgTable(
  "ops_analyses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    incidentId: uuid("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"),
    summary: text("summary"),
    likelyCause: text("likely_cause"),
    confidence: integer("confidence_basis_points"),
    impact: text("impact"),
    recommendedActions: jsonb("recommended_actions").$type<{ capability: string; reason: string }[]>().notNull().default([]),
    facts: jsonb("facts").$type<string[]>().notNull().default([]),
    hypotheses: jsonb("hypotheses").$type<{ statement: string; confidence: "LOW" | "MEDIUM" | "HIGH" }[]>().notNull().default([]),
    correlations: jsonb("correlations").$type<string[]>().notNull().default([]),
    relevantRepositoryFiles: jsonb("relevant_repository_files").$type<string[]>().notNull().default([]),
    recommendedChecks: jsonb("recommended_checks").$type<string[]>().notNull().default([]),
    safetyConstraints: jsonb("safety_constraints").$type<string[]>().notNull().default([]),
    engineeringEscalation: text("engineering_escalation"),
    modelMetadata: jsonb("model_metadata").$type<Record<string, unknown>>().notNull().default({}),
    provider: text("provider").notNull().default("vertex_ai"),
    model: text("model"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    claimToken: text("claim_token"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({ incidentCurrentIdx: uniqueIndex("ops_analyses_incident_current_idx").on(table.incidentId) }),
);

export const expectedExecutionContracts = pgTable("expected_execution_contracts", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  expectedEventType: text("expected_event_type").notNull(),
  schedule: text("schedule").notNull(),
  timezone: text("timezone").notNull(),
  gracePeriodSeconds: integer("grace_period_seconds").notNull(),
  severityOnMiss: text("severity_on_miss").notNull().default("WARNING"),
  enabled: text("enabled").notNull().default("true"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One durable record per contract occurrence; this is evidence, not a scheduler. */
export const expectedExecutionOccurrences = pgTable("expected_execution_occurrences", {
  id: uuid("id").defaultRandom().primaryKey(),
  contractId: uuid("contract_id").notNull().references(() => expectedExecutionContracts.id, { onDelete: "cascade" }),
  expectedAt: timestamp("expected_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("MISSED"),
  missedAt: timestamp("missed_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  sourceEventId: uuid("source_event_id").references(() => events.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ occurrenceIdx: uniqueIndex("expected_execution_occurrences_contract_time_idx").on(table.contractId, table.expectedAt) }));

export const projectDependencies = pgTable("project_dependencies", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  dependencyKey: text("dependency_key").notNull(),
  dependencyType: text("dependency_type").notNull().default("service"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ projectDependencyIdx: uniqueIndex("project_dependencies_project_key_idx").on(table.projectId, table.dependencyKey) }));

export const operationalChanges = pgTable("operational_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  externalId: text("external_id"),
  summary: text("summary").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectRepositories = pgTable("project_repositories", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  owner: text("owner").notNull(),
  repository: text("repository").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  readOnly: text("read_only").notNull().default("true"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ projectRepositoryIdx: uniqueIndex("project_repositories_project_idx").on(table.projectId) }));

export const recoveryEvidence = pgTable("recovery_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  incidentId: uuid("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  sourceEventId: uuid("source_event_id").references(() => events.id),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata").notNull().default({}),
});

export const incidentMemory = pgTable("incident_memory", {
  id: uuid("id").defaultRandom().primaryKey(),
  incidentId: uuid("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
  fingerprint: text("fingerprint").notNull(),
  component: text("component"),
  confirmedRootCause: text("confirmed_root_cause"),
  failureDomain: text("failure_domain"),
  fixSummary: text("fix_summary"),
  recoveryEvidence: jsonb("recovery_evidence").notNull().default([]),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const resourceSnapshots = pgTable("resource_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  scope: text("scope").notNull().default("neo-avo-host"),
  cpuPercent: integer("cpu_percent"),
  memoryPercent: integer("memory_percent"),
  diskPercent: integer("disk_percent"),
  serviceState: jsonb("service_state").notNull().default({}),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resourceAggregates5m = pgTable(
  "resource_aggregates_5m",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hostId: text("host_id").notNull().default("shared-prod-01"),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    sampleCount: integer("sample_count").notNull(),
    cpuPercentMean: integer("cpu_percent_mean").notNull(),
    cpuPercentMax: integer("cpu_percent_max").notNull(),
    memoryPercentMean: integer("memory_percent_mean").notNull(),
    memoryPercentMax: integer("memory_percent_max").notNull(),
    diskPercentMean: integer("disk_percent_mean").notNull(),
    diskPercentMax: integer("disk_percent_max").notNull(),
    pressureStatePeak: text("pressure_state_peak").notNull().default("NORMAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bucketIdx: uniqueIndex("resource_aggregates_5m_host_bucket_idx").on(table.hostId, table.bucketStart),
  }),
);

export const resourceAggregates1h = pgTable(
  "resource_aggregates_1h",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hostId: text("host_id").notNull().default("shared-prod-01"),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    sampleCount: integer("sample_count").notNull(),
    cpuPercentMean: integer("cpu_percent_mean").notNull(),
    cpuPercentMax: integer("cpu_percent_max").notNull(),
    memoryPercentMean: integer("memory_percent_mean").notNull(),
    memoryPercentMax: integer("memory_percent_max").notNull(),
    diskPercentMean: integer("disk_percent_mean").notNull(),
    diskPercentMax: integer("disk_percent_max").notNull(),
    pressureStatePeak: text("pressure_state_peak").notNull().default("NORMAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bucketIdx: uniqueIndex("resource_aggregates_1h_host_bucket_idx").on(table.hostId, table.bucketStart),
  }),
);


export const opsAnalysisInvocations = pgTable("ops_analysis_invocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  analysisId: uuid("analysis_id").notNull().references(() => opsAnalyses.id, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(),
  model: text("model"),
  status: text("status").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const commands = pgTable("commands", {
  id: uuid("id").defaultRandom().primaryKey(),
  commandId: text("command_id").notNull().unique(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  environment: text("environment").notNull(),
  capability: text("capability").notNull(),
  arguments: jsonb("arguments").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("REQUESTED"),
  deliveryMode: text("delivery_mode").notNull(),
  deliveryAttempts: integer("delivery_attempts").notNull().default(0),
  nextDeliveryAt: timestamp("next_delivery_at", { withTimezone: true }),
  claimToken: text("claim_token"),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  resultAt: timestamp("result_at", { withTimezone: true }),
  result: jsonb("result"),
  failureReason: text("failure_reason"),
  rejectionReason: text("rejection_reason"),
  requestedBy: text("requested_by").notNull().default("operator"),
  auditMetadata: jsonb("audit_metadata").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
