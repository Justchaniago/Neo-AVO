# M7 Bounded Commands

Commands are durable operational intents. Neo AVO does not implement project business logic: the connected project remains the execution authority.

## Contract

Supported V1 capability schemas are explicit and allowlisted: `task.retry` and `task.cancel` require `{ taskId }`; `worker.restart` accepts an optional `{ workerId }`. Unsupported capabilities, including shell/process/HTTP/SQL/deployment/file operations, are rejected. An AI recommendation never creates a command; an operator must request it through the private operator API/UI.

Every command has one stable `commandId`, project/environment scope, `validUntil`, and a bounded lifecycle: `REQUESTED`, `SENT`, `ACKNOWLEDGED`, `COMPLETED`, `FAILED`, `REJECTED`, or `EXPIRED`. Terminal states cannot regress. Delivery retries preserve the same command ID and are limited to three attempts.

## Delivery

PULL projects authenticate with their M1 project credential and can only fetch their own project/environment commands using `GET /api/v1/commands/pending`. They report `POST /api/v1/commands/:commandId/ack` and `POST /api/v1/commands/:commandId/result`. No long polling or universal cadence is imposed.

PUSH projects configure an HTTPS endpoint and a distinct outbound secret. The secret is encrypted with AES-256-GCM before storage; `COMMAND_ENCRYPTION_KEY` is a runtime-only 32-byte hex key. The worker claims and persists delivery state before making network calls, sends a bounded envelope outside the transaction, and records failures without affecting events, projections, incidents, or notifications.

The private single-operator deployment assumption applies to command creation (`POST /api/v1/commands`); M7 does not add RBAC. Project callbacks remain credential-authenticated and independently authorized by project/environment scope.

## Expiration and independence

Expired commands are never returned by PULL or attempted by PUSH. External projects must treat `commandId` as their idempotency key and must not execute expired commands. If Neo AVO or a project endpoint is unavailable, the project’s core operation remains independent and command state remains durable for bounded retry or operator inspection.
