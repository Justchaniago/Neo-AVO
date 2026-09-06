# M2 Event Ingestion Contract

`POST /api/v1/events` accepts only the canonical object envelope `{ "events": [...] }`. A batch contains 1–100 events and is limited to 1 MB by `Content-Length` when supplied. Unknown additive fields on the envelope and event are retained by validation and ignored by M2 persistence.

Each event requires `schemaVersion: 1`, `eventId`, `projectId`, `environment`, `type`, `occurredAt`, and `data`. `sequence` is optional. The event type registry is explicit; unknown types and invalid type-specific data receive `400` and are never persisted. The authenticated project is resolved from the M1 Bearer credential and environment header. Every event must identify that same project (UUID or registered slug) and environment.

Batch semantics are atomic. The complete request is authenticated and validated before one PostgreSQL transaction inserts all raw events. `event_id` is globally unique; `ON CONFLICT DO NOTHING` makes replayed event IDs idempotent. A committed batch returns `202` with total, persisted, and duplicate counts. Any database failure rolls back the transaction and returns `503`; it never returns `202`. No projection, worker processing, incident handling, notification, AI, or command logic runs in the request path.

Raw events retain `received_at`, `processed_at`, `processing_attempts`, `processing_error`, and `quarantined_at` for the worker milestone. M2 does not claim or process events.
