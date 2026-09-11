# Neo AVO Mobile v1 — Data and Health Semantics

## Invariants
Availability ≠ Operational Health ≠ Business Health
CPU Utilization ≠ Load Average
No Active Incident ≠ Healthy
Telemetry Missing ≠ Healthy
Client Offline ≠ Server Offline
Correlation ≠ Causation
Potential Blast Radius ≠ Confirmed Impact
Recovery Detected ≠ Incident Resolved
AI Hypothesis ≠ Machine Fact

## Availability
ONLINE / OFFLINE / UNKNOWN.

## Operational Health
HEALTHY / DEGRADED / FAILING / UNKNOWN.

## Business Health
HEALTHY / DEGRADED / FAILING / UNKNOWN.

## Global Health
Use all relevant dimensions and current infrastructure state. Reuse canonical backend aggregation if it exists.

## CPU and Load
Load average is not CPU utilization. Never label normalized load as CPU usage. Preferred: `SYSTEM LOAD 1.06 / 2 vCPU (53% capacity)`. If real CPU utilization is collected, show separately.

## Freshness
For 30s infrastructure collector, recommended UI baseline: <90s live, 90–180s stale, >180s unknown.

## Missing Data
Missing is not zero. Charts must render gaps as gaps.

## Recovery
Manual resolution does not fabricate machine recovery.

## Blast Radius
Potential impact only; actual impact needs project-specific evidence.

## AI
AI interprets/correlates/hypothesizes but does not redefine machine facts.
