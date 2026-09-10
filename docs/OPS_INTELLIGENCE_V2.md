# Operations Intelligence v2 (additive baseline)

Neo AVO remains an observe-first control plane. Projects execute business work; Neo AVO records evidence, derives deterministic health, investigates bounded context, escalates, and verifies recovery. AI and repository access are advisory and read-only.

## Health semantics

`availability` answers whether the runtime is reachable. `operational_health` answers whether execution components function. `business_health` answers whether expected business effects are completing. These values are stored and displayed independently; AI cannot change them.

## Registration primitives

Projects can be extended with `expected_execution_contracts` (event signal, normalized schedule/timezone, grace window, miss severity), `project_dependencies`, `operational_changes`, and one read-only `project_repositories` record. Contract evaluation is deterministic and emits an occurrence-specific `EXPECTED_EXECUTION_MISSED` fact key, which is safe to use for incident deduplication.

## Investigation trust boundary

`ops_analyses` stores structured advisory output: facts, hypotheses with LOW/MEDIUM/HIGH confidence, correlations, bounded file references, checks, safety constraints, model metadata, and failure state. Event, log, and repository content is untrusted evidence and is explicitly wrapped as such before Vertex invocation. No project credentials or secret values are selected by the context builder.

## Recovery and memory

`recovery_evidence` records business-effect evidence independently of availability. `incident_memory` stores structured historical fingerprints and resolution knowledge; similarity is deterministic and must be labeled historical similarity, not causal proof.

## Deployment/runbook

Apply migration `0010_absurd_enchantress.sql` once through the existing migration runner, then restart web and worker using `docs/M8_PRODUCTION_RUNBOOK.md`. Run fixture tests and the production environment check before restart. Never use live project commands as acceptance tests; Telegram sends, Sheets writes, Gmail drafts, QRA executions, and business mutations remain zero during validation.

## Current limitation

This baseline supplies additive schema, backend context, deterministic contracts/utilities, structured validation, and the three-dimensional UI. Full provider-backed repository retrieval, scheduled worker evaluation of every contract, recovery-state transition policy, cost/resource providers, and live production acceptance still require a separately authorized integration pass with production identity, backup/provenance, and provider configuration.
