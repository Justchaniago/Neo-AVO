# ADR-028: Project Operational Control Lifecycle (`Pause` / `Resume` / `Start`)

**Status:** PROPOSED — Ready for Implementation  
**Date:** 2026-11-18

## Problem

Operators need a safe, centralized mechanism in Neo AVO to temporarily pause a project (e.g., during upstream spreadsheet maintenance, credential rotation, or external provider outages), resume it cleanly, or trigger an immediate on-demand run (`Start`), without:
1. Triggering false-positive `OFFLINE`, `FAILING`, or `EXPECTED_EXECUTION_MISSED` alerts while the project is intentionally paused;
2. Triggering a burst of stale `OFFLINE` or `EXPECTED_EXECUTION_MISSED` alerts at the moment the project is resumed;
3. Leaving a project permanently paused by accident ("forgotten pause");
4. Violating `INV-001` (project independence) or `ADR-013` (bounded capability-based commands).

## Decision

Implement a two-layer **Hybrid Operational Control** model:

1. **Control-Plane State on `projects`**:
   - Add `control_state` (`ACTIVE`, `PAUSE_REQUESTED`, `PAUSED`, `RESUME_REQUESTED`), `paused_at`, `paused_until` (optional safety TTL for automatic resume), `pause_reason`, and `last_resumed_at` to `projects`.
   - While `control_state` is `PAUSED` or `PAUSE_REQUESTED`:
     - Event ingestion (`POST /api/v1/events`) continues to accept and persist events (`INV-006`).
     - `monitorProjectHealth` does not degrade `availability`, `operational_health`, or `business_health`.
     - `evaluateExpectedExecutions` skips occurrences while paused and ignores occurrences prior to `last_resumed_at`.
     - `recordIncidentForEvent` suppresses outbound Telegram notifications (except internal poison event alerts).
   - When `paused_until <= now`, the Neo AVO worker automatically resumes the project and emits `project.auto_resumed`.

2. **Capability-Scoped Bounded Commands (`runtime.pause`, `runtime.resume`, `runtime.start`)**:
   - Connected projects that support active runtime control declare `runtime.pause`, `runtime.resume`, and/or `runtime.start` in `projects.capabilities`.
   - When pausing/resuming a project with these capabilities, Neo AVO both updates its control-plane state and queues the corresponding bounded command.
   - Connected workers persist their local paused state (e.g., in local SQLite) and skip scheduled business executions while keeping their Neo AVO command polling loop alive so they can receive `runtime.resume`.

## Invariants Preserved

- **INV-001**: Connected projects continue operating with their last persisted local state if Neo AVO is unreachable.
- **INV-002 / ADR-013**: Neo AVO never executes OS/shell commands (`systemctl`, `kill`) against connected projects.
- **INV-006**: Telemetry emitted by in-flight tasks during pause is still durably recorded.
- **INV-014**: Commands remain TTL-bounded and idempotent.
