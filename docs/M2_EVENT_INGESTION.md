# M2 Event Ingestion Contract

`POST /api/v1/events` accepts only the canonical object envelope `{ "events": [...] }`. A batch contains 1–100 events and is limited to 1 MB by `Content-Length` when supplied. Unknown additive fields on the envelope and event are retained by validation and ignored by M2 persistence.

Each event requires `schemaVersion: 1`, `eventId`, `projectId`, `environment`, `type`, `occurredAt`, and `data`. `sequence` is optional. The event type registry is explicit; unknown types and invalid type-specific data receive `400` and are never persisted. The authenticated project is resolved from the M1 Bearer credential and environment header. Every event must identify that same project (UUID or registered slug) and environment.

Batch semantics are atomic. The complete request is authenticated and validated before one PostgreSQL transaction inserts all raw events. `event_id` is globally unique; `ON CONFLICT DO NOTHING` makes replayed event IDs idempotent. A committed batch returns `202` with total, persisted, and duplicate counts. Any database failure rolls back the transaction and returns `503`; it never returns `202`. No projection, worker processing, incident handling, notification, AI, or command logic runs in the request path.

Raw events retain `received_at`, `processed_at`, `processing_attempts`, `processing_error`, and `quarantined_at` for the worker milestone. M2 does not claim or process events.

## Tele Auto V2 integration types

Neo AVO reuses this generic endpoint for Tele Auto V2. The accepted normalized types are `tele_auto.run.received`, `tele_auto.run.processing`, `tele_auto.run.needs_clarification`, `tele_auto.run.awaiting_confirmation`, `tele_auto.run.completed`, `tele_auto.run.failed`, `tele_auto.run.effect_uncertain`, `tele_auto.worker.recovery`, `tele_auto.telegram.delivery_failed`, and `tele_auto.sheets.schema_mismatch`. Their `data` is restricted to bounded operational context: `runId`, `store`, `domain`, `status`, `severity`, `executionPhase`, `errorCode`, `durationMs`, and safe scalar metadata. Unknown top-level/additive data keys are stripped for these types; sensitive metadata keys are rejected. Raw messages, spreadsheet contents, credentials, and business quantities are not accepted into the Tele Auto event projection.
