# Neo AVO Mobile v1 — Master Implementation Prompt

You are implementing the Neo AVO Mobile v1 project.

The complete implementation contract is in `docs/mobile-v1/`.

Before editing code, read:
- `docs/mobile-v1/README.md`
- `docs/mobile-v1/00_MASTER_PLAN.md`
- `docs/mobile-v1/13_AGENT_EXECUTION_CONTRACT.md`

Then follow the document authority graph in `13_AGENT_EXECUTION_CONTRACT.md`.

NON-NEGOTIABLES:
1. Mobile is a mobile operational command center, not desktop stacked vertically.
2. Desktop is protected.
3. Shared domain/API/health semantics remain single source of truth.
4. Mobile and desktop may have separate composition and interaction components.
5. Do not invent API fields, services, health semantics, or backend capabilities.
6. Do not mutate project business systems during implementation/acceptance.
7. Do not claim completion from tests/build alone.
8. Production acceptance must satisfy `11_TEST_ACCEPTANCE_MATRIX.md`.
9. Deployment must follow `12_DEPLOYMENT_RUNBOOK.md`.
10. Verify host provenance before production operations.

Execute autonomously through:
RECONNAISSANCE → SEMANTIC CORRECTIONS → PRESENTATION BOUNDARY → MOBILE SHELL → OVERVIEW/PROJECTS → INCIDENT WORKFLOW → INFRASTRUCTURE → SECONDARY SCREENS → ERROR/STALE/OFFLINE → DESKTOP REGRESSION → TESTS/BUILD → PRODUCTION DEPLOY → ACCEPTANCE.

Stop only for a genuine external blocker defined in the execution contract.

Required final verdict if all mandatory acceptance items pass:
`NEO_AVO_MOBILE_V1_PRODUCTION_ACCEPTED`
