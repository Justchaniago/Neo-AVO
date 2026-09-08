# First Project Integration Guide

The project is registered through `POST /api/v1/projects`; the response contains one generated M1 credential. Store it in the project runtime secret store. Configure the project’s exact environment and declared capabilities. Credentials are scoped to that project/environment and are not interchangeable.

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
  https://neo-office.chaniago.me/api/v1/commands/pending
```

Execute only the project’s own bounded capability, reject commands past `validUntil`, deduplicate by `commandId`, then call `/api/v1/commands/<commandId>/ack` and `/result` with the same credential. Poll cadence is project-owned; Neo AVO does not require long polling or a universal interval.

For PUSH smoke testing, run `MOCK_COMMAND_AUTH=<random-secret> npm run command:mock` and configure a disposable PUSH project endpoint as `http://127.0.0.1:8787/commands` with that distinct secret. The adapter accepts each command ID once and returns `already_processed` on duplicate delivery; it implements no project action. The real target must provide its own authenticated endpoint and remain the execution authority.
