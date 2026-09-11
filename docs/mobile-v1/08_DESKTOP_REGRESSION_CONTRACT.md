# Neo AVO Mobile v1 — Desktop Regression Contract

## Protected Baseline
Desktop UI is already accepted and must remain stable.

## Permitted Changes
1. CPU/load semantics.
2. Telemetry freshness/stale semantics.
3. Global health aggregation.
4. Infrastructure overview card density/status treatment.

## Forbidden
Sidebar redesign, nav reorder, global font change, layout rewrite, project detail redesign, incident inspector redesign, card-system replacement, arbitrary spacing cleanup, new theme.

## Baseline Capture
Before implementation record representative desktop screenshots/interactions at 1440px and 1920px.

## Regression Acceptance
Compare same routes after implementation. Verify no unexpected layout shift/overflow and existing commands/incidents still work.

## Infrastructure Card
Default neutral surface; green reserved for status indicators; compact; freshness visible; CPU wording honest.

## Global State
`SYSTEMS NOMINAL` must derive from availability + operational + business + infrastructure + active attention context. No active incidents alone is insufficient.
