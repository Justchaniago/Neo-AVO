# M5 Incidents and Telegram

M5 uses explicit deterministic triggers: task failure grouped by project/environment and error signature, project stopped/offline, dependency degradation, expected execution overdue, and quarantined events. An incident is `OPEN`, can move to `ACKNOWLEDGED`, and can move to `RESOLVED` only when matching recovery evidence is clear. Equivalent evidence within 15 minutes updates one open/acknowledged incident and links its raw event without copying payloads.

HIGH and CRITICAL incidents create one durable Telegram notification intent. INFO and WARNING remain dashboard-only. A recovery creates one recovery intent. Notifications are claimed independently, retried with a bounded five-attempt policy and one-minute retry delay, and never participate in the raw event/projection transaction after its commit. Telegram credentials are environment-only (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) and are never persisted or logged.

M6 AI may later enrich an existing incident, but cannot create it, determine severity, or delay its first deterministic alert.
