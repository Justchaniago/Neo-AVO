# M5 Incidents and Telegram

M5 uses explicit deterministic triggers: task failure grouped by project/environment and error signature, project stopped/offline, dependency degradation, expected execution overdue, and quarantined events. An incident is `OPEN`, can move to `ACKNOWLEDGED`, and can move to `RESOLVED` only when matching recovery evidence is clear or manual owner resolution occurs.

## Active Incident Deduplication Contract

For the same:
- `project_id`
- `environment`
- `dedup_key`

an existing incident in `OPEN` or `ACKNOWLEDGED` state is reused regardless of age. A new incident is created only after the previous matching incident is `RESOLVED` (enforced by the PostgreSQL partial unique index `incidents_open_dedup_idx` on `(project_id, environment, dedup_key) WHERE state <> 'RESOLVED'`).

Deduplication behavior across event arrivals:
- Repeated new events link to the same active incident via `incident_events`.
- `occurrence_count` increments for a genuinely new canonical event.
- Duplicate replay of the same event is idempotent and does not increment `occurrence_count` or create duplicate `incident_events` links.
- The initial Telegram notification intent is created only on initial incident creation and is not re-created for an already-active incident.

HIGH and CRITICAL incidents create one durable Telegram notification intent. INFO and WARNING remain dashboard-only. A recovery creates one recovery intent. Notifications are claimed independently, retried with a bounded five-attempt policy and one-minute retry delay, and never participate in the raw event/projection transaction after its commit. Telegram credentials are environment-only (`TELEGRAM_BOT_TOKEN`, `NEO_AVO_TELEGRAM_ALLOWED_CHAT_ID`) and are never persisted or logged. The bot accepts only owner-chat read-only `/status`, `/recent`, and `/incidents` queries; unauthorized chats are ignored.

M6 AI may later enrich an existing incident, but cannot create it, determine severity, or delay its first deterministic alert.
