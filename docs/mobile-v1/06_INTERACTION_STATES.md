# Neo AVO Mobile v1 — Interaction and State Contract

## Loading
Skeleton on first load. Preserve current data during refresh.

## Empty
Explain what is absent: no incidents, no pressure, no expected execution, no repository context.

## Error
Identify domain: client, Neo AVO API, repository, Vertex, monitored project, infrastructure collector.

## Stale / Unknown
Stale remains visible but marked stale. Unknown is neutral, never healthy.

## Offline
Keep last known state and show timestamp.

## Acknowledge
Changes incident workflow state only.

## Manual Resolve
Requires confirmation and optional note; clearly manual; no fabricated recovery evidence.

## Recovery
Machine-driven evidence shown before resolution where applicable.

## Analyze Again
Explicit action, disabled while running, must respect cost/usage guard.

## Copy Escalation
Produces deterministic copy-ready package and confirms copy success.

## Bounded Commands
Show scope and side effect, confirm before submit, show running/terminal state, preserve idempotency.

## Navigation State
Preserve filters, selected tab, range, and reasonable scroll position on back.
