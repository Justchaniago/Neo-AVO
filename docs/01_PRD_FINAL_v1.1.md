# NEO AVO — Product Requirements Document

**Version:** 1.1 Final  
**Status:** FROZEN — Baseline Implementation Approved  
**Product Type:** AI-Native Operations & Control Hub  
**Primary User:** Single system owner/operator  
**Architecture:** Modular monolith, dual runtime process  
**Primary Database:** PostgreSQL

---

# 1. Product Definition

Neo AVO is the central operational visibility, attention, intelligence, and bounded-control layer for an ecosystem of independent software systems, agents, bots, automations, and processing pipelines.

Neo AVO does not execute the core business function of connected projects.

It answers:

1. What systems exist?
2. What are they doing?
3. Which systems are unhealthy?
4. What requires operator attention?
5. What bounded action can safely be requested?
6. What does the available operational evidence suggest is happening?

Product definition:

> **Neo AVO is an observe-first operations hub with bounded control and an optional AI operations intelligence layer.**

Strategic definition:

> **Neo AVO is an AI-native operations layer for an ecosystem of independent software systems, agents, bots, and automations.**

---

# 2. Core Philosophy

## 2.1 Project Sovereignty

Every connected project owns:
- its repository;
- runtime;
- business logic;
- domain data;
- deployment lifecycle;
- credentials;
- project-specific recovery behavior.

Neo AVO owns operational metadata about those systems.

## 2.2 Observe First

Neo AVO first records facts:
- task started/completed/failed;
- dependency degraded/recovered;
- project health;
- operational state;
- incident conditions.

Observation does not imply automatic intervention.

## 2.3 Bounded Control

Neo AVO may request only explicit capabilities declared by a project.

Examples:
- `task.retry`
- `task.cancel`
- `worker.restart`
- `integration.recheck`

Forbidden generic capabilities:
- arbitrary shell;
- arbitrary code execution;
- unrestricted SQL;
- generic deploy-anything;
- project-specific business logic implemented inside Neo AVO.

> Neo AVO may request an action; the project owns execution.

## 2.4 Deterministic Facts Before AI

Machines determine what happened when it can be determined deterministically.

AI helps interpret:
- likely cause;
- impact;
- correlations;
- recommended next actions.

AI must not sit in the critical alert delivery path.

## 2.5 Complexity Must Be Earned

No infrastructure or abstraction is added because it may theoretically be useful later.

The burden of proof belongs to the proposed complexity.

---

# 3. Non-Negotiable Invariants

**INV-001** No project may depend on Neo AVO to perform its core function.

**INV-002** Neo AVO never owns project business logic.

**INV-003** Neo AVO is not a generic workflow engine.

**INV-004** Neo AVO is not a generic agent runtime.

**INV-005** Neo AVO is not the mandatory model gateway for connected projects.

**INV-006** Accepted operational events are durably persisted before downstream processing.

**INV-007** AI does not determine facts that can be computed deterministically.

**INV-008** Commands are capability-scoped.

**INV-009** Credentials are isolated per project; no universal project master credential.

**INV-010** Telemetry failure must not convert a successful project business operation into failure.

**INV-011** Infrastructure complexity requires measured need.

**INV-012** Event arrival order is not authoritative logical order.

**INV-013** Critical notifications must not wait for AI.

**INV-014** Stale or duplicate commands must not execute unsafely.

**INV-015** Long-lived event processing must not depend on the Next.js request lifecycle.

---

# 4. Goals

Neo AVO V1 must provide:

- project registry;
- project operational status;
- canonical event ingestion;
- durable event processing;
- task projection;
- incident detection;
- alert deduplication;
- Telegram escalation;
- bounded command requests;
- Ops Analyst incident enrichment;
- operational history;
- minimum self-observability.

---

# 5. Explicit Non-Goals

V1 is not:
- an IDE;
- source-code editor;
- CI/CD platform;
- deployment orchestrator;
- Kubernetes replacement;
- Temporal/Airflow replacement;
- generic scheduler;
- centralized project runtime;
- log warehouse;
- metrics warehouse;
- Sentry/Grafana replacement;
- generic shell;
- SSH manager;
- secrets vault;
- enterprise multi-tenant platform;
- multi-agent hierarchy.

---

# 6. Supported Project Runtime Modes

A project declares:

```text
always_on
on_demand
scheduled
hybrid
```

It also declares a health strategy:

```text
heartbeat
execution_based
synthetic
external
```

## always_on

Missing heartbeat beyond project threshold may indicate degradation/offline state.

## on_demand

Zero active instances is normal. Absence of heartbeat is not outage evidence.

## scheduled

Health is evaluated against expected executions and grace periods.

## hybrid

Combines execution and continuous/scheduled health semantics.

For `execution_based` scheduled behavior:

> If no expected execution telemetry arrives by `expected_at + grace_period`, Neo AVO may raise `EXPECTED_RUN_OVERDUE`.

Synthetic probing is opt-in/risk-based, not universal.

---

# 7. Availability and Health

Availability:

```text
ONLINE
STALE
OFFLINE
UNKNOWN
```

Operational health:

```text
HEALTHY
DEGRADED
FAILING
UNKNOWN
```

These are separate dimensions.

An ONLINE project may be DEGRADED.

---

# 8. Canonical Event Contract

Endpoint:

```http
POST /api/v1/events
```

Canonical request shape:

```json
{
  "events": [
    {
      "schemaVersion": 1,
      "eventId": "evt_...",
      "projectId": "keymax",
      "environment": "production",
      "type": "task.failed",
      "occurredAt": "2026-09-06T12:40:00.000+07:00",
      "sequence": 18,
      "data": {
        "taskId": "task_123",
        "attempt": 2,
        "message": "Provider timeout",
        "dependency": "gemini_api"
      }
    }
  ]
}
```

`sequence` is optional globally.

For multi-worker/distributed task event producers, the producer MUST provide at least one reliable logical discriminator such as:
- monotonic sequence; or
- `runId` / equivalent execution identity; or
- attempt identity where sufficient for that task model.

Required envelope fields:

```text
schemaVersion
eventId
projectId
environment
type
occurredAt
data
```

---

# 9. Schema Evolution

`schemaVersion` represents the canonical envelope version.

Rules:

1. Backward-compatible event data additions do not require a new envelope version.
2. Unknown optional fields must be tolerated.
3. Missing required fields are rejected at ingestion.
4. Unknown event types are rejected safely and must never crash the processor.
5. Breaking changes to envelope semantics require a new `schemaVersion`.
6. Neo AVO upgrades must not require all project adapters to deploy simultaneously when compatibility can reasonably be preserved.
7. Per-event-type validation is maintained independently of the generic envelope.

---

# 10. Initial Event Registry

Initial canonical types:

```text
system.heartbeat

project.started
project.stopped

task.started
task.completed
task.failed
task.cancelled
task.retrying

agent.started
agent.completed
agent.blocked
agent.failed

dependency.degraded
dependency.recovered

deployment.completed
deployment.failed

command.acknowledged
command.completed
command.failed
```

Do not add event types without a concrete producer and consumer behavior.

---

# 11. Durable Ingestion Contract

Request path:

```text
HTTP
→ authenticate project
→ validate envelope
→ validate event type
→ enforce idempotency
→ durable raw-event insert
→ 202 Accepted
```

Downstream projection, incident detection, AI analysis, and Telegram notification do not run as prerequisites for the ingestion response.

The ingestion path must remain responsive independently of downstream processor health.

Neo AVO measures from day one:
- ingestion latency;
- inbox drain lag;
- pending event count;
- oldest pending event;
- processing failure rate;
- ingestion 429/503 rate.

SLOs are established from production baseline evidence, not guessed before deployment.

---

# 12. Event Processing

A separate long-lived worker process consumes durable pending events.

Required semantics:

- at-least-once durable processing;
- concurrent processors must not process the same claimed event simultaneously;
- claiming must avoid unnecessary contention;
- processing failure must not lose the raw event;
- poison events must not retry forever.

PostgreSQL is the V1 durable inbox.

`FOR UPDATE SKIP LOCKED` is a preferred V1 implementation, not a permanent product contract.

No Redis/Kafka/RabbitMQ is required for V1.

---

# 13. Poison Event Quarantine

Event processing records:

```text
processing_attempts
processing_error
processed_at
quarantined_at
```

After bounded repeated processing failure:
- event is quarantined;
- normal processor skips it;
- Neo AVO creates an internal operational incident;
- raw evidence remains available for diagnosis.

---

# 14. Event Ordering and Projection Safety

`receivedAt` must never be used as logical overwrite authority.

Preferred logical ordering:

```text
producer sequence/run semantics
→ occurredAt
```

Projection must guard against stale events.

Terminal states must not regress because an older/equal stale event arrives.

For retryable tasks, V1 uses:
- `tasks.current_attempt`;
- `tasks.last_error_signature`;
- event-level `attempt`, `runId`, or sequence metadata when needed.

A first-class `execution_attempts` table is deferred.

It is introduced only when real operational queries require attempt-level projections such as:
- duration per attempt;
- cost per attempt;
- worker/provider per attempt;
- attempt-specific artifacts.

Event history remains the source for reconstructing V1 attempt history.

---

# 15. Current-State Projection

Neo AVO uses:

> append-only operational events + current-state projections.

It does not implement full event sourcing.

Initial projections:

```text
projects
tasks
incidents
commands
```

Events preserve evidence/history.

Projection tables optimize operational queries.

---

# 16. Task Model

Suggested states:

```text
pending
running
blocked
retrying
completed
failed
cancelled
```

Minimum useful fields:

```text
project_id
external_task_id
type
status
current_attempt
last_error
last_error_signature
last_event_at
started_at
completed_at
metadata
```

Neo AVO normalizes operational state, not project business semantics.

---

# 17. Incident Engine

Pipeline:

```text
event
→ deterministic rule evaluation
→ incident
├→ deterministic alert
└→ async Ops Analyst
```

Raw errors are not directly sent to AI as the incident detector.

Example rules:
- repeated same-signature failures;
- missed heartbeat for always-on project;
- expected scheduled execution overdue;
- backlog threshold exceeded;
- dependency degradation.

---

# 18. Incident Lifecycle

V1 states:

```text
OPEN
ACKNOWLEDGED
RESOLVED
```

No `MITIGATING` state in V1.

Severity:

```text
INFO
WARNING
HIGH
CRITICAL
```

---

# 19. Alerting and Correlation

Repeated equivalent failures collapse into one incident when appropriate.

Incidents may include:

```text
dependency_key
```

Example:

```text
gemini_api
google_sheets
cloudflare
```

Notification dispatch may group/suppress multiple open incidents sharing the same dependency.

V1 does not require a first-class `MetaIncident` aggregate.

Alerting policy:

```text
INFO      → dashboard
WARNING   → dashboard/digest
HIGH      → immediate Telegram
CRITICAL  → immediate Telegram + escalation behavior
```

Recovery notification is supported.

---

# 20. AI / Ops Analyst

V1 has one AI operational persona: **Ops Analyst**.

Responsibilities:
- summarize incidents;
- identify likely cause;
- correlate relevant evidence;
- estimate impact;
- recommend bounded next actions;
- produce operational briefs.

It does not:
- calculate deterministic health facts;
- execute remediation;
- deploy;
- mutate arbitrary DB state;
- execute shell;
- own project runtime.

Input is structured and bounded.

Example output:

```json
{
  "summary": "...",
  "likelyCause": "...",
  "confidence": 0.81,
  "impact": "...",
  "recommendedActions": []
}
```

AI calls are incident-gated or explicitly user-requested.

---

# 21. Critical Notification Path

CRITICAL/HIGH alert flow:

```text
incident created
→ deterministic Telegram alert immediately
→ async Ops Analyst
→ persist analysis
→ edit/enrich Telegram message
```

If the AI provider is slow or unavailable, the deterministic alert remains successful.

---

# 22. Command Model

Commands are operational intent requests.

Neo AVO never implements project-specific execution logic.

Every command includes at minimum:

```text
commandId
projectId
capability
arguments
requestedAt
validUntil
```

Command lifecycle:

```text
REQUESTED
SENT
ACKNOWLEDGED
COMPLETED
FAILED
REJECTED
EXPIRED
```

Authorization is a check, not a required persisted lifecycle state.

---

# 23. Command Safety

Every command must enforce:
- declared capability;
- project identity;
- authorization;
- expiration;
- command ID idempotency.

Receiver must reject:
- expired commands;
- duplicate unsafe execution;
- unsupported capability;
- invalid credentials.

TTL prevents stale execution.

Idempotency prevents duplicate execution.

---

# 24. Command Delivery

Supported semantics:

```text
PUSH
PULL
```

## PUSH

Neo AVO sends to a reachable authenticated project endpoint.

## PULL

Project retrieves pending commands and reports results.

PULL may use:
- periodic polling;
- active-state short polling;
- heartbeat/sync piggyback;
- another bounded project-appropriate cadence.

Long polling is not mandatory.

Polling frequency is project configuration, not a global architecture constant.

Interactive/urgent projects may poll more aggressively while active.

Idle lightweight projects need not continuously wake only for command polling.

---

# 25. Project Credentials

Each project receives isolated credentials.

No global credential grants command authority over every project.

V1 may use securely generated per-project tokens stored hashed where appropriate.

Future signing/HMAC can be added if threat model requires it.

Secrets never enter:
- Git;
- event payloads;
- logs;
- AI prompts.

---

# 26. Serverless Adapter Contract

Serverless adapters must not rely on post-response fire-and-forget telemetry.

Telemetry dispatch must:
- occur inside active execution context;
- use bounded timeout;
- fail independently from successful business result.

Conceptual behavior:

```text
business operation
→ bounded telemetry flush
→ return response
```

If telemetry fails:
- business result remains unchanged;
- adapter may log or retry using project-appropriate durability.

A persistent client outbox is not mandatory for every project.

---

# 27. Project Integration Adapter

A project integration is thin.

Responsibilities:
- emit operational events;
- declare identity/runtime metadata;
- declare capabilities;
- receive/fetch commands if applicable;
- report command results.

Existing projects are not rewritten merely to integrate with Neo AVO.

SDK extraction is deferred until 2–3 real integrations reveal stable patterns.

---

# 28. Dashboard

V1 has three primary surfaces:

## Overview
- project health;
- open incidents;
- active tasks;
- recent activity.

## Project Detail
- availability;
- health;
- runtime mode;
- health strategy;
- last activity/success;
- tasks;
- incidents;
- capabilities;
- bounded controls.

## Incidents
- severity;
- duration;
- affected project/dependency;
- deterministic facts;
- AI analysis;
- recommendations;
- lifecycle/history.

No dashboard builder or workflow editor.

---

# 29. Data Ownership

Neo AVO owns:
- operational events;
- project operational metadata;
- task projections;
- incidents;
- command records;
- AI analyses;
- notification records.

Projects own:
- business data;
- domain truth;
- customer data;
- execution logic;
- business configuration.

Neo AVO is never authoritative for project business state.

---

# 30. Database and Retention

Primary DB: PostgreSQL.

Initial tables:

```text
projects
project_credentials
events
tasks
incidents
incident_events
commands
ops_analyses
notifications
```

Additional tables require current use cases.

Suggested initial retention:
- raw operational events: 90 days;
- incidents: long-term;
- commands: long-term;
- analyses: long-term;
- notification history: 90 days;
- heartbeat detail: short-lived or transition-focused.

Retention implementation must avoid large blocking deletes.

---

# 31. Runtime Architecture

Neo AVO remains one product and one repository but uses two process lifecycles:

```text
WEB
- dashboard
- API
- event ingestion

WORKER
- durable event processor
- projections
- incident evaluator
- notifications
- Ops Analyst orchestration
```

Both share:
- domain code;
- Drizzle schema;
- PostgreSQL.

No HTTP boundary is required between web and worker.

The worker must never be implemented as a `setInterval` loop hidden inside a Next.js route lifecycle.

---

# 32. Deployment

Initial Neo AVO production target:

```text
low-cost always-on VM
├── web process
├── worker process
├── PostgreSQL
└── reverse proxy
```

External projects select runtime based on workload:
- always-on → VM/container;
- bursty HTTP → serverless;
- scheduled → scheduler + serverless/job;
- heavy processing → dedicated worker/compute.

Physical co-location is allowed but creates a shared failure domain.

Logical independence remains mandatory.

---

# 33. Backup and Disaster Recovery

Production V1 requires off-host PostgreSQL backup.

Minimum:
- daily database backup;
- off-host object storage;
- retention policy;
- documented restore procedure;
- periodic restore test.

Initial planning target:

```text
RPO ≈ 24 hours
RTO = manual recovery within hours
```

These are planning targets, not enterprise HA guarantees.

HA database infrastructure is deferred until operational criticality requires it.

---

# 34. Self-Observability

Neo AVO monitors at minimum:
- web health;
- DB connectivity;
- worker health;
- pending event count;
- oldest pending event;
- processing errors;
- quarantined events;
- Telegram delivery failures;
- backup failures;
- disk/storage risk.

Internal incidents should be distinguishable from project incidents, e.g.:

```text
source_scope = neo_avo | project
```

---

# 35. Backpressure

Neo AVO does not promise infinite ingestion throughput.

Under overload it may return bounded failure responses such as:
- 429;
- 503.

Project adapters must treat telemetry retry as secondary to core business execution.

No project may enter a business failure loop merely because Neo AVO is overloaded.

---

# 36. Technology Baseline

Preferred V1:
- Next.js;
- TypeScript;
- PostgreSQL;
- Drizzle ORM;
- Zod;
- Tailwind;
- Vitest;
- Playwright only for high-value E2E paths.

Next.js is primarily the web/application shell.

Long-lived processing runs in the worker process.

Framework replacement is not an architecture change unless external contracts or ownership boundaries change.

---

# 37. Testing Strategy

Tests are risk-based.

Required behavioral areas:
- event schema validation;
- event idempotency;
- batch validation;
- projection ordering;
- terminal-state regression prevention;
- retry/attempt handling;
- incident deduplication;
- command authorization;
- command expiration;
- command idempotency;
- poison event quarantine;
- project independence when Neo AVO is unavailable.

Golden E2E paths should remain few and high-value.

No arbitrary coverage target.

> Tests protect behavior, not implementation.

---

# 38. Engineering Simplicity Rules

1. No speculative infrastructure.
2. No abstraction before the second real use case.
3. No microservices for V1.
4. No Redis without measured need.
5. No external queue without measured need.
6. No Kubernetes.
7. No generic framework for hypothetical future projects.
8. Prefer boring technology.
9. One obvious path per operation.
10. Delete dead code.
11. Tests protect behavior.
12. Projects remain operational without Neo AVO.
13. Neo AVO never owns project business logic.
14. Every dependency requires a current concrete use case.
15. Complexity must be earned.
16. Do not convert implementation preferences into architecture contracts without evidence.

---

# 39. Initial Integration Strategy

Integrate sequentially:

1. lightweight Telegram → AI parser → Google Sheets automation;
2. agentic project such as Keymax;
3. heavier processing project.

Purpose:
- Project 1 validates basic contract.
- Project 2 challenges task/agent/dependency semantics.
- Project 3 challenges batching, concurrency, and long-running behavior.

Only then consider a shared Neo AVO SDK.

---

# 40. Definition of Done — V1

V1 is complete when:

1. Project registration works.
2. Per-project authentication works.
3. Batch event ingestion works.
4. Events are idempotent.
5. Accepted events are durable before 202.
6. Worker processes events independently of web lifecycle.
7. Out-of-order events cannot trivially regress state.
8. Poison events quarantine safely.
9. Task projection works.
10. Health semantics differ correctly by runtime/strategy.
11. Incidents are deterministic and deduplicated.
12. HIGH/CRITICAL Telegram alerts do not wait for AI.
13. AI can enrich an incident asynchronously.
14. Commands are capability-scoped.
15. Commands expire.
16. Commands are idempotent.
17. PUSH and PULL command semantics are supported by the architecture.
18. Project core function survives Neo AVO unavailability.
19. Production backup and restore procedure exists.
20. One real external project is integrated end-to-end.

---

# 41. Final Product Principle

Neo AVO provides:

```text
visibility
context
attention
intelligence
bounded control
```

It does not own execution.

> **If Neo AVO disappears tomorrow, every connected project must still know how to do its job.**

> **Be conservative about contracts. Be aggressive about simplifying implementation.**

> **Logical architecture may be mature. Physical architecture stays simple until reality earns additional complexity.**
