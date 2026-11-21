# First Project Integration Guide

An operator registers the project through `POST /api/v1/projects` using HTTP Basic credentials (`NEO_AVO_OPERATOR_USERNAME` / `NEO_AVO_OPERATOR_PASSWORD`) over HTTPS; the response contains one generated M1 credential. Store only the M1 credential in the project runtime secret store, not the operator credentials. Configure the project’s exact environment and declared capabilities. Credentials are scoped to that project/environment and are not interchangeable. Administrative command creation (`POST /api/v1/commands`) also requires operator Basic auth. Runtime event, command poll/ack/result, project GET/PATCH, and credential rotation routes continue to use the project's Bearer credential and environment header without operator Basic auth.

For the first Tele Auto V2 registration, use the canonical identity `slug: tele-auto`, `name: Tele Auto V2`, `environment: production`, and no command capabilities. `runtimeMode: on_demand` with `healthStrategy: execution_based` is the safe default when Tele Auto is request-driven; choose `scheduled` only when an actual expected schedule is configured. No period without user input should be interpreted as offline.

Send only the canonical event envelope to `POST /api/v1/events` with `Authorization: Bearer <project-token>` and `X-Neo-Avo-Environment: <environment>`:

```json
{"events":[{"schemaVersion":1,"eventId":"evt_123","projectId":"<project-uuid-or-slug>","environment":"production","type":"system.heartbeat","occurredAt":"2026-09-06T00:00:00Z","data":{}}]}
```

For heartbeat strategy, emit `system.heartbeat` on the project’s configured cadence. Execution-based projects should emit task/execution telemetry supported by the event registry; on-demand projects with no active instance are not automatically offline.

Tele Auto’s normalized event types are `tele_auto.run.received`, `tele_auto.run.processing`, `tele_auto.run.needs_clarification`, `tele_auto.run.awaiting_confirmation`, `tele_auto.run.completed`, `tele_auto.run.failed`, `tele_auto.run.effect_uncertain`, `tele_auto.worker.recovery`, `tele_auto.telegram.delivery_failed`, and `tele_auto.sheets.schema_mismatch`. Use `data.runId`, optional `store` (`PMS`/`TP6`), optional `domain` (`PRODUCTION`/`WASTE`/`DAILY_SO`), normalized `status`, `severity`, `executionPhase`, `errorCode`, `durationMs`, and bounded technical metadata. Do not send message text, spreadsheet contents, SKU/quantity data, or credentials.

For PULL commands, use the M1 credential and environment header:

```sh
curl -H "Authorization: Bearer $PROJECT_TOKEN" \
  -H "X-Neo-Avo-Environment: production" \
  https://neo-avo.chaniago.me/api/v1/commands/pending
```

Execute only the project’s own bounded capability, reject commands past `validUntil`, deduplicate by `commandId`, then call `/api/v1/commands/<commandId>/ack` and `/result` with the same credential. Poll cadence is project-owned; Neo AVO does not require long polling or a universal interval.

For local PUSH smoke testing, run `MOCK_COMMAND_AUTH=<random-secret> npm run command:mock`, configure a disposable PUSH project endpoint as `http://127.0.0.1:8787/commands` with that distinct secret, and start the Neo AVO worker with `NODE_ENV=development NEO_AVO_ALLOW_PRIVATE_COMMAND_ENDPOINTS=true npm run worker`. The mock script only receives commands; it makes no administrative API calls and needs no Basic credentials. The adapter accepts each command ID once and returns `already_processed` on duplicate delivery; it implements no project action. Production targets must use HTTPS, resolve to public addresses, and not redirect. Leave the private-endpoint override disabled in production. The real target must provide its own authenticated endpoint and remain the execution authority.
