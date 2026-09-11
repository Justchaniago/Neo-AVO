# Neo AVO Mobile v1 — Implementation Plan

## Phase 0 Reconnaissance
Inspect routes, components, tokens, CSS, data hooks, dashboard/infrastructure/incident APIs, existing mobile code. Build internal component/protected-surface map before editing.

## Phase 1 Semantic Corrections
CPU/load, freshness, global health, desktop infrastructure card.

## Phase 2 Presentation Boundary
Create only the shared primitives and mobile/desktop composition boundary actually needed.

## Phase 3 Mobile Shell
Header, bottom nav, safe areas, container, secondary menu.

## Phase 4 Overview + Projects
Purpose-built mobile compositions.

## Phase 5 Incident Workflow
List, full-screen detail, AI, evidence, escalation, recovery, manual resolution.

## Phase 6 Infrastructure
Current state, freshness, ranges, charts, services, pressure, blast radius.

## Phase 7 Secondary Screens
Activity, Intelligence, Agents, Settings, Search.

## Phase 8 State System
Loading, stale, unknown, offline, provider errors.

## Phase 9 Responsive + Regression
Mobile widths, tablet edge cases, desktop 1440/1920.

## Phase 10 Build
Tests, typecheck, production build.

## Phase 11 Deploy
Use existing safe deployment and host identity guardrails.

## Phase 12 Acceptance
Use acceptance matrix; no project business mutations.

## Anti-Hallucination Rules
Before modifying feature: read implementation. Before using field: verify schema/type/API. Before changing semantics: trace producer → persistence → API → UI. Before referencing service: verify registry. Before desktop change: compare protected baseline. Before production conclusion: verify production host.
