# M3 Worker and Projection Semantics

The worker claims one pending event at a time using a PostgreSQL transaction with `FOR UPDATE SKIP LOCKED`. The claim commits a worker token, lease timestamps, and one processing attempt. Processing happens after the claim transaction. Projection and `processed_at` update happen in one transaction and require the claim token. A worker crash before that commit leaves the raw event unprocessed; after the lease expires another worker can claim it.

Failures retain the raw event, incrementing attempts at claim time. The bounded diagnostic is truncated to 1,000 characters. After three attempts the event receives `quarantined_at` and normal claiming skips it. There is no external dead-letter queue.

Task projection is keyed by project, environment, and external task ID. Sequence is authoritative when both events have numeric sequences. Otherwise a newer attempt advances state; same-attempt events use run identity and then `occurredAt`. `received_at` is never used for ordering. Terminal states (`completed`, `failed`, `cancelled`) cannot regress from stale/equal events. A retry/new attempt can advance a terminal task only when the attempt identity is greater.
