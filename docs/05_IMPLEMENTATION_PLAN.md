# Neo AVO — Baseline Implementation Plan

This is a milestone plan, not permission to pre-build later phases.

# M0 — Repository Foundation

Deliver:
- package/tooling;
- TypeScript;
- Next.js shell;
- PostgreSQL/Drizzle setup;
- config/env validation;
- worker entrypoint;
- health endpoint;
- basic CI/test command;
- `AGENTS.md` governance.

Exit:
- web boots;
- worker boots;
- DB migration works;
- no domain feature yet.

# M1 — Project Registry + Authentication

Deliver:
- projects table;
- project credentials;
- project registration/config;
- runtime mode;
- health strategy;
- capability declaration;
- authentication middleware.

Exit:
- registered project can authenticate;
- credential isolation tested.

# M2 — Durable Event Ingestion

Deliver:
- canonical `{events:[...]}` endpoint;
- envelope v1;
- event-type registry;
- Zod validation;
- idempotency;
- durable raw event storage;
- `202 Accepted`;
- body/batch limits;
- safe invalid/unknown event response.

Exit:
- no projection/AI/Telegram required to return 202.

# M3 — Worker + Projection Safety

Deliver:
- durable event claiming;
- at-least-once processor semantics;
- processing attempts/errors;
- quarantine;
- task projection;
- ordering guards;
- attempt metadata;
- terminal-state regression protection.

Exit:
- duplicate and reordered event tests pass;
- poison event cannot stall processor.

# M4 — Project Health + Dashboard Core

Deliver:
- availability;
- health;
- runtime/health strategy handling;
- execution-overdue rule;
- Overview;
- Project Detail;
- recent activity.

Exit:
- always-on and on-demand projects behave differently and correctly.

# M5 — Incident Engine + Telegram

Deliver:
- deterministic incident rules;
- severity;
- deduplication;
- 3-state lifecycle;
- dependency key;
- notification cooldown/suppression;
- deterministic Telegram alert;
- recovery notification;
- Neo AVO internal incidents.

Exit:
- repeated failures create one actionable incident;
- AI is not required.

# M6 — Ops Analyst

Deliver:
- structured incident context;
- provider abstraction only as needed for actual provider;
- structured output;
- async analysis;
- persistence;
- Telegram message enrichment/update.

Exit:
- AI failure does not affect incident detection/first alert.

# M7 — Commands

Deliver:
- capability model;
- command record;
- TTL;
- idempotency;
- lifecycle;
- PUSH semantics;
- PULL semantics;
- project-configurable polling behavior;
- audit.

Exit:
- stale/duplicate command cannot execute unsafely.

# M8 — Production Hardening

Deliver:
- process supervision/containerization decision;
- reverse proxy;
- backup job;
- off-host backup;
- restore runbook;
- retention cleanup;
- self-health signals;
- deployment docs.

Exit:
- restore has been tested;
- web/worker restart safely.

# M9 — First Real Integration

Target:
Telegram → AI parser → Google Sheets automation.

Deliver:
- thin adapter;
- events;
- serverless bounded telemetry flush;
- project health semantics;
- at least one bounded command if operationally useful.

Exit:
- project continues business flow when Neo AVO is unavailable;
- Neo AVO receives useful operational context when available.

# M10 — Contract Validation

Integrate second project (agentic, e.g. Keymax).

Do not create SDK before this milestone demonstrates repeated integration patterns.

# Milestone Gate Rule

Agent A implements one milestone at a time.

Agent B reviews:
- M0 architecture hygiene;
- M2 external contract;
- M3 correctness;
- M5 incident semantics;
- M7 command security;
- M8 production readiness.

Agent B may review other milestones opportunistically but must not block on style preferences.
