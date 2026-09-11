# Neo AVO Mobile v1 — Deployment Runbook

## Preconditions
Implementation converged, acceptance tests pass, desktop regression passes, no conflicting deploy, target host verified.

## Target Provenance
Verify hostname, OS, user, cwd, project, environment. Never perform production actions from local Mac by mistake.

## Guardrails
Reuse deploy preflight, lock, pressure policy, safe build/deploy mechanism. Do not deploy under sustained critical pressure.

## Database
No schema change expected for presentation-only work. If unexpectedly required: explicit justification, additive only, reviewed, existing backup mechanism, no new infrastructure.

## Activation
Restart only required Neo AVO services. Do not restart QRA/Briefing/Auto Email/Tele V2 for UI deployment.

## Post-Deploy
Verify `/api/health`, DB, web, worker, Overview, Projects, Incidents, Infrastructure, mobile route behavior, desktop behavior.

## Rollback
Use existing release rollback. Preserve DB unless migration rollback is explicitly safe and necessary.

## Acceptance
Use `11_TEST_ACCEPTANCE_MATRIX.md`. Build success alone is not acceptance.
