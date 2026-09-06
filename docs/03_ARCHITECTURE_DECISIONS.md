# Neo AVO — Architecture Decision Register

Architecture is frozen for baseline V1. New architecture changes require a new ADR entry.

## ADR-001 — Greenfield, Not Refactor
**Decision:** Neo AVO is a greenfield system. Old AVO is donor/reference only.  
**Reason:** Avoid inheriting execution-centric complexity.

## ADR-002 — Control/Intelligence Plane, Not Execution Plane
**Decision:** Connected projects remain independently executable.  
**Invariant:** Neo AVO outage must not stop project core behavior.

## ADR-003 — Modular Monolith
**Decision:** One repository/product/database.  
**Reason:** Current scale does not justify distributed services.

## ADR-004 — Dual Process Lifecycle
**Decision:** Separate `web` and long-lived `worker` processes.  
**Reason:** Background processing must not depend on Next.js request lifecycle.

## ADR-005 — PostgreSQL Durable Inbox
**Decision:** Persist accepted events in PostgreSQL before downstream processing.  
**Reason:** Durability without introducing an external broker.

## ADR-006 — 202 Before Downstream Processing
**Decision:** Event ingestion returns after durable acceptance.  
**Reason:** Protect ingestion from projection/AI/notification latency.

## ADR-007 — Append-Only Events + Current-State Projection
**Decision:** No full event sourcing.  
**Reason:** Preserve history while keeping operational reads simple.

## ADR-008 — Arrival Order Is Not Logical Order
**Decision:** Projection uses producer logical ordering/occurredAt guards.  
**Reason:** Retries and distributed delivery can reorder events.

## ADR-009 — Attempts Remain Lightweight in V1
**Decision:** Use `current_attempt` plus event attempt/run metadata. No `execution_attempts` table initially.  
**Trigger to revisit:** Real attempt-level operational queries.

## ADR-010 — Deterministic Incident Engine Before AI
**Decision:** AI does not detect raw facts.  
**Reason:** Reliability, cost, explainability.

## ADR-011 — Alert Before AI
**Decision:** HIGH/CRITICAL deterministic Telegram notification is sent before AI enrichment.  
**Reason:** AI provider latency/failure must not delay alerts.

## ADR-012 — Three Incident States
**Decision:** `OPEN`, `ACKNOWLEDGED`, `RESOLVED`.  
**Reason:** Avoid unused state-machine ceremony.

## ADR-013 — Capability-Based Commands
**Decision:** No generic arbitrary execution endpoint.  
**Reason:** Bound central control blast radius.

## ADR-014 — PUSH + PULL Command Semantics
**Decision:** Command transport supports reachable and private runtimes.  
**Reason:** NAT/serverless/private workers differ.

## ADR-015 — Command TTL + Idempotency
**Decision:** Commands expire and duplicate IDs must not cause duplicate unsafe execution.

## ADR-016 — Serverless Telemetry Is Bounded
**Decision:** Telemetry is flushed in active execution context with bounded timeout; failure does not alter successful business result.

## ADR-017 — Canonical Batch Envelope
**Decision:** `/api/v1/events` accepts `{ "events": [...] }`.  
**Reason:** One parser shape and efficient heavy producers.

## ADR-018 — Schema Compatibility
**Decision:** Envelope versioning is explicit; optional additive fields are tolerated; breaking envelope changes increment version.

## ADR-019 — Project-Specific Health Strategy
**Decision:** `heartbeat`, `execution_based`, `synthetic`, or `external`.  
**Reason:** Serverless idle is not equivalent to offline.

## ADR-020 — No First-Class Meta-Incident in V1
**Decision:** Use dependency keys and notification correlation first.

## ADR-021 — No Hardcoded Scale Thresholds in PRD
**Decision:** Measure ingestion latency, drain lag, backlog, failures from day one; set SLOs after baseline evidence.

## ADR-022 — Off-Host Backup Required for Production
**Decision:** Daily DB backup + restore procedure/test.

## ADR-023 — SDK Deferred
**Decision:** Integrate 2–3 projects via simple HTTP before extracting shared SDK.

## ADR-024 — No Speculative Infrastructure
**Decision:** No Redis, Kafka, Kubernetes, external queue, microservices, multi-agent Ops hierarchy until a measured current need exists.
