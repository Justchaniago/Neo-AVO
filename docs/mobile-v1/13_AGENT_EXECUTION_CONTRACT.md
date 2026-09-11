# Neo AVO Mobile v1 — Agent Execution Contract

## Authority Graph
Read in order:
1. 00_MASTER_PLAN.md
2. 01_PRODUCT_PRINCIPLES.md
3. 09_DATA_AND_HEALTH_SEMANTICS.md
4. 08_DESKTOP_REGRESSION_CONTRACT.md
5. 02_INFORMATION_ARCHITECTURE.md
6. 03_MOBILE_UX_BLUEPRINT.md
7. 04_DESIGN_SYSTEM_CONTRACT.md
8. 05_SCREEN_SPECIFICATIONS.md
9. 06_INTERACTION_STATES.md
10. 07_RESPONSIVE_ARCHITECTURE.md
11. 10_IMPLEMENTATION_PLAN.md
12. 11_TEST_ACCEPTANCE_MATRIX.md
13. 12_DEPLOYMENT_RUNBOOK.md

If conflict: Master Plan wins; Data/Health wins for semantics; Desktop Regression wins for desktop protection; safe existing production behavior wins over speculative UI.

## No-Improvisation Zones
Health semantics, CPU/load meaning, incident lifecycle, bounded-command behavior, desktop redesign, repository write capability, production mutation behavior.

## Autonomous Decisions Allowed
File organization, small primitive extraction, CSS implementation, breakpoint reuse, test details, safe internal refactors.

## Stop Conditions
Only genuine blockers: missing production credential, destructive migration ambiguity, unknown mutation risk, irreconcilable repo-vs-contract conflict, inaccessible production target.

## Convergence Rule
Do not devolve into patch → test → review loops. Diagnose architecture, implement coherent phases, then run focused acceptance.

## No Hallucination
Never invent API fields, routes, capabilities, services, states, repository context, or production host state. Verify first.

## Final Report
Map directly to acceptance matrix with evidence, not vague claims like “responsive” or “looks good”.
