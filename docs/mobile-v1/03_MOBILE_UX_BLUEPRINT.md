# Neo AVO Mobile v1 — UX Blueprint

## Overview — Normal
Goal: understand system state within 3–5 seconds.
Order: global state → attention → infrastructure → recent activity.

## Overview — Attention
When a HIGH/CRITICAL incident exists, attention moves above healthy summaries. Do not bury high-severity incidents.

## Incident Detail
Order:
1. severity/status/time
2. title/signature
3. what happened
4. business impact
5. AI assessment
6. why AVO thinks this
7. recommended next step
8. recovery
9. expandable evidence
10. actions

Machine evidence should be short and scannable. AI must separate facts from hypotheses and show confidence.

## Project Detail
Top: project, environment, availability, operational health, business health, last success, next expected execution. Then progressive sections: Attention, Execution, Dependencies, Repository, Timeline, Commands. Event-driven projects must not show fake next execution.

## Infrastructure
Top: host, health, freshness. Current: load, memory, disk, swap, services. History: 1h/6h/24h/7d/30d. Then pressure episodes, services, blast radius, timeline. Charts stack vertically.

## Command Confirmation
Mutating bounded commands use bottom confirmation sheet showing target, scope, date, side effect, cancel, confirm.

## Client Offline
Show last known state with timestamp and retry. Never reinterpret client offline as project/server failure.

## Freshness
For 30s collector baseline: <90s LIVE, 90–180s STALE, >180s UNKNOWN, unless canonical backend values differ.

## Loading
Use skeletons on first load. During refresh, keep old data visible and indicate updating.

## Error Domains
Differentiate client offline, Neo AVO API unavailable, monitored system unavailable, stale telemetry, partial data, and AI/provider failure.
