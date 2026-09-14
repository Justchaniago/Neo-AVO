# Recovery Runbook: Poison Event Recovery for Incident Deduplication Hotfix

STATUS: NOT YET EXECUTABLE

> [!CAUTION]
> This runbook is a non-executable planning specification. Neo AVO currently has no supported bounded quarantine replay mechanism. Do NOT execute ad-hoc database updates or manual SQL against production until a supported replay procedure has been reviewed and cleared by Agent B.

---

## 1. Incident Context

- **Originating Canonical Event**: `7d6b47e6-d2de-4218-ac60-f914ee8d3830` (`briefing-f30249e7-cdb8-4787-95fe-1edd42c0f1c5`)
- **Project**: `briefing-agent` (`production`)
- **Event Type**: `task.failed`
- **Root Cause**: `duplicate key value violates unique constraint "incidents_open_dedup_idx"` due to 15-minute sliding window filter on an active incident older than 15 minutes.
- **Generated POISON_EVENT Incident**: `4f329d18-c494-4278-b126-02a631d775db`
- **Target Active TASK_FAILURE Incident**: `ecc2428b-a7b0-4731-8f18-ced0aa5f28a4` (`briefing-agent:production:task-failure:task failure`)

---

## 2. Required Recovery Outcomes (Post-Hotfix Deployment)

Once the production hotfix (`hotfix/incident-active-dedup`) is deployed and a supported recovery procedure is approved, the recovery execution must satisfy the following verified outcomes:

1. **Reprocessing Eligibility**: The single quarantined source event (`7d6b47e6-d2de-4218-ac60-f914ee8d3830`) becomes eligible for worker claim and processing.
2. **Exactly-Once Processing**: The worker claims and processes the source event exactly once.
3. **Incident Reuse**: The existing active `TASK_FAILURE` incident (`ecc2428b-a7b0-4731-8f18-ced0aa5f28a4`) is reused; no second active `TASK_FAILURE` incident is created.
4. **Evidence Link**: An `incident_events` link is created between the source event and the `TASK_FAILURE` incident.
5. **Occurrence Count**: The `occurrence_count` on the `TASK_FAILURE` incident increments by exactly 1.
6. **Processed Timestamp**: The source event record in `events` has `processed_at` populated, `quarantined_at` cleared, and `processing_error` cleared.
7. **No Poison Regress**: No new `POISON_EVENT` incident is generated during or after reprocessing.
8. **Audit Resolution**: The original `POISON_EVENT` incident (`4f329d18-c494-4278-b126-02a631d775db`) is manually resolved with a clear audit note documenting the hotfix and quarantine recovery.
