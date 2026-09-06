# Neo AVO — System Design

**Version:** 1.0  
**Status:** Baseline Design  
**Derived From:** PRD v1.1

# 1. System Shape

Neo AVO is a modular monolith with two process lifecycles and one PostgreSQL system of record.

```text
External Projects
       │
       │ HTTPS event batches
       ▼
┌────────────────────────────┐
│ WEB PROCESS                │
│                            │
│ Next.js UI                 │
│ Project APIs               │
│ Event ingestion            │
│ Command/operator APIs      │
└─────────────┬──────────────┘
              │
              ▼
         PostgreSQL
              │
              ▼
┌────────────────────────────┐
│ WORKER PROCESS             │
│                            │
│ Event claiming             │
│ State projection           │
│ Incident evaluation        │
│ Notification dispatch      │
│ Ops Analyst orchestration  │
└────────────────────────────┘
```

No HTTP API boundary exists between web and worker. They share modules and DB.

# 2. Suggested Repository Layout

```text
neo-avo/
├── app/
│   ├── api/
│   └── dashboard/
├── src/
│   ├── config/
│   ├── projects/
│   ├── events/
│   ├── tasks/
│   ├── incidents/
│   ├── commands/
│   ├── ops/
│   ├── notifications/
│   ├── db/
│   └── worker/
├── db/
│   └── migrations/
├── tests/
├── docs/
├── package.json
└── AGENTS.md
```

Do not mechanically create controller/service/repository interfaces for every module.

# 3. Web Responsibilities

The web process owns:
- dashboard rendering;
- operator request handling;
- event ingestion;
- project registration/configuration;
- command creation;
- read APIs.

Event ingestion stops after durable acceptance.

# 4. Worker Responsibilities

The worker owns:
- claiming unprocessed events;
- projection;
- incident evaluation;
- quarantine;
- deterministic notification dispatch;
- AI enrichment;
- scheduled internal checks where required.

The worker must survive/recover cleanly across restarts because state is durable in PostgreSQL.

# 5. Event Processing State

Suggested event fields:

```text
id
event_id UNIQUE
schema_version
project_id
environment
type
occurred_at
sequence nullable
data jsonb
received_at
processing_attempts
processing_error
processed_at
quarantined_at
```

# 6. Projection Safety

Projectors must be idempotent.

They must not assume:
- delivery once;
- ordered arrival;
- one producer;
- no retries.

A stale event may remain in event history while being intentionally ignored for current-state regression.

# 7. Command Delivery

Command persistence is transport-independent.

```text
command created
→ authorized/validated
→ pending delivery
→ PUSH or PULL
→ project acknowledgment
→ project result
```

PUSH and PULL operate on the same command record.

# 8. Notification Flow

```text
incident transition
→ deterministic message
→ Telegram
→ AI analysis async
→ update persisted incident analysis
→ optionally edit Telegram message
```

AI outage never blocks the first alert.

# 9. Failure Isolation

## PostgreSQL unavailable
- ingestion fails cleanly;
- project business operation must not depend on ingestion success.

## Worker down
- web may continue accepting events while DB capacity allows;
- inbox accumulates;
- self-health must expose lag.

## Web down
- project telemetry fails;
- projects continue core operations;
- worker may continue processing already persisted events.

## Telegram down
- incident remains stored;
- notification failure becomes internal operational evidence.

## AI provider down
- deterministic incident detection and Telegram remain functional.

# 10. Scaling Seams

Scale only when measured.

Possible future:
- multiple web instances;
- multiple worker processes;
- managed PostgreSQL;
- external queue;
- dedicated ingestion service.

External event/command contracts should not need redesign for these changes.

# 11. Database Ownership

PostgreSQL is Neo AVO operational truth, not external project business truth.

Do not mirror full project databases into Neo AVO.

# 12. Deployment Baseline

Initial VM may run:

```text
reverse proxy
web process
worker process
PostgreSQL
backup job
```

Use process supervision/container restart policy.

Exact deployment mechanism is implementation-level unless it changes failure isolation.

# 13. Security Boundary

Project credentials identify a single project/environment.

Command authorization checks:
- project;
- capability;
- expiry;
- idempotency.

Never infer command permission solely from UI visibility.

# 14. Internal Scheduling

Small internal checks such as:
- overdue expected execution;
- notification cooldown;
- event backlog;
may run in worker.

Neo AVO must not evolve into a generic external project scheduler.
