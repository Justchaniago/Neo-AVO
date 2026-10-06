# ADR-027: QRA Daily Reconcile Observability

**Status:** ACCEPTED — implementation authorized by user on 2026-10-07; Agent B review ACCEPT  
**Date:** 2026-10-07

## Problem

QRA has distinct operations that must remain distinct in Neo AVO:

1. The scheduled same-day run (`qra-sameday`, 23:00–23:09 WIB) extracts and writes the daily report.
2. The scheduled daily reconcile (`qra-reconcile`, 00:00 WIB) compares the previous business date's durable QRA receipt with Google Sheets. It is read-only and must never trigger extraction, repair, or a Sheet write.
3. The existing Neo AVO capability `qra.audit_missing_dates` audits completeness across a selected month/store. It is not the daily receipt-vs-Sheet reconcile.
4. `qra.resolve_missing_dates` is an explicit recovery/backfill operation, with a fresh QRA-side audit preflight and guarded writes.

Neo AVO currently exposes monthly audit and recovery in one QRA panel. QRA emits daily reconcile events as `qra.audit.started/completed`, which does not identify the operation distinctly in Neo AVO. This creates operator ambiguity and makes daily reconcile health/receipts hard to distinguish from the monthly audit.

## Evidence

- QRA `00-SSOT.md` and `02-ARCHITECTURE.md` define 23:00 same-day extraction and 00:00 read-only previous-day reconciliation.
- QRA `src/qra/application/reconciliation.py` identifies reconcile runs as `qra-reconcile:<business_date>` and emits generic `qra.audit.*` telemetry.
- Neo AVO `src/commands/types.ts` supports monthly audit and resolve commands but no reconcile command.
- Neo AVO `app/ui/qra-audit-control.tsx` presents monthly audit and recovery together without a daily reconcile view.

## Options

### A. Keep generic audit events and only relabel the existing panel

No external contract change. Lowest implementation cost, but Neo AVO cannot reliably distinguish the daily reconcile result from monthly audit event semantics or provide a dedicated date-level reconcile receipt.

### B. Add a uniquely named QRA reconcile telemetry event family; keep it scheduled and read-only

QRA emits explicit `qra.reconcile.started`, `qra.reconcile.completed`, and `qra.reconcile.failed` events with the existing schema version 1 envelope. Each invocation receives a unique attempt ID; `data.commandId` is `qra-reconcile:<date>:<attempt-id>`, and event IDs include the same attempt ID plus phase. Retries of the same HTTP event reuse the event ID for deduplication, while a later reconcile attempt for that business date remains visible. Events carry `date`, `store=ALL`, `status`, `mutation=NONE`, a bounded `reason`, duration, aggregate counts, and a bounded `stores` object with exactly `PMS` and `TP6`. Each store value has a stable `status` enum (`VERIFIED`, `VERIFIED_PARTIAL`, `MISSING_RUN`, `RUN_FAILED`, `RUN_IDENTITY_MISMATCH`, `UNVERIFIED_RECEIPT`, `WRITE_UNCONFIRMED`, `SHEET_INCOMPLETE`, `RESULT_MISMATCH`, `CHECK_UNAVAILABLE`) plus stable reason code and optional metric-key names from the QRA metric enum; raw Sheet values and source metric values are prohibited. `qra.reconcile.completed` means the verification operation ran to completion; `data.outcome` is separately one of `VERIFIED`, `GAPS_FOUND`, or `CHECK_UNAVAILABLE`. `qra.reconcile.failed` is reserved for an operation-level exception that prevented a completed verification result.

Neo AVO observes and displays those events, but does not initiate extraction or recovery from them. Existing monthly audit and recovery capabilities retain their meanings.

This requires coordinated external event contract changes and a compatibility window for existing QRA emitters/Neo AVO consumers.

### C. Add a Neo AVO `qra.reconcile` command

Neo AVO requests a date reconcile from QRA. This adds command delivery, QRA command-runner behavior, retry/idempotency policy, and operator-initiated scheduling semantics despite QRA already owning the 00:00 timer. It risks duplicate work and expands Neo AVO's control surface without a demonstrated need.

## Proposed decision

Choose **Option B**. Daily reconcile is owned and scheduled by QRA. Neo AVO is an observer/control-plane view of its receipt, not its trigger. Align Neo AVO's expected-execution contract to QRA's existing 00:00 WIB reconcile timer by expecting `qra.reconcile.completed` with `mutation=NONE`, using a 900-second grace window. Remove the obsolete 03:00 expectation and repurpose the 04:00 expectation to 00:00 reconcile. The reconcile event checks and reports the prior same-day PMS and TP6 receipts, so a separate 23:00 expected contract is not required for this slice. Keep monthly completeness audit and explicit backfill as separate operator actions.

## Invariants

- QRA remains able to run when Neo AVO is unavailable.
- The 00:00 reconcile is read-only: no Sheet mutation, no Quinos extraction, and no automatic repair.
- Reconcile gaps are diagnostic findings; they do not themselves mean QRA execution failed if the reconcile completed correctly. Neo AVO displays the operation state and data outcome separately in the dedicated result view. This event family does not establish sales business success or alter Business Health based on the data outcome. A late completed reconcile may resolve only the missed occurrence for the same scheduled local calendar date. Neo AVO derives that occurrence from the event time and contract timezone, then looks up the exact occurrence timestamp; it never picks the oldest outstanding miss. Data-gap findings remain visible and never resolve a data-quality incident. Existing expected-execution contracts remain responsible for missed-schedule evaluation.
- Monthly completeness audit remains `qra.audit_missing_dates`; it is not renamed or silently repurposed.
- Recovery remains explicit `qra.resolve_missing_dates`, and only eligible missing/partial dates from a fresh audit may be written under QRA's existing guards.
- Missing/partial/unknown source metrics remain explicitly represented; no inferred zero or success state.
- QRA event delivery remains best effort and cannot fail or delay QRA business operations.
- Neo AVO event ingestion deduplicates by globally unique `eventId` with `ON CONFLICT DO NOTHING`; producer retries must reuse the same ID for the same logical phase/date so redelivery does not create another stored event.

## Migration impact

1. Add the event contract to QRA and Neo AVO schemas, validators, and docs. Keep schemaVersion 1 because the canonical envelope is unchanged; event types are additive.
2. QRA emits both new `qra.reconcile.*` events and legacy `qra.audit.*` events for 14 calendar days after Neo AVO production acceptance. The new names use distinct `eventId`s; Neo AVO must not map legacy reconcile `qra.audit.*` records into the dedicated reconcile projection, health, or incident policy.
3. Neo AVO adds a read-only daily reconcile result view, separate from monthly audit and recovery controls. A `qra.reconcile.completed` event with `outcome=GAPS_FOUND` or `CHECK_UNAVAILABLE` is displayed as a completed check with a finding; `qra.reconcile.failed` is displayed as an operation failure. Reconcile outcome does not change Business Health or create a business-success claim for verified sales; only a matching missed-execution occurrence may be resolved by proof that the scheduled operation eventually ran.
4. Test duplicate IDs, duplicate delivery, late/reordered phase events, gaps, per-store partial outcomes, redelivery, and QRA/Neo AVO outage behavior. Event timeline arrival is not treated as phase ordering; the reconcile view selects the latest logical run/date and terminal event by `occurredAt` with deterministic event ID tie-break, while exposing `receivedAt` for delay diagnostics.
5. Compatibility exit gate: after 14 days, confirm in production that Neo AVO has received and validated at least one terminal `qra.reconcile.*` event for each scheduled day, no reconcile-specific incidents/health transitions were derived from legacy `qra.audit.*`, and no new event quarantine occurred. Then remove legacy `qra.audit.*` emissions from the reconcile producer in a separately reviewed QRA change. If any gate fails, continue dual emission and investigate; do not silently cut over.

Daily execution expectation monitoring uses the existing QRA 00:00 timer as the source of schedule truth. The aggregate reconcile completion event is matched with `mutation=NONE`; the event carries per-store outcomes for the primary PMS and TP6 runs. The 900-second grace exceeds the last observed production reconcile runtime (67 seconds) while allowing time for event delivery and worker polling. When an expectation contract is created or rescheduled after that day's scheduled time, Neo AVO starts evaluating it at the next occurrence rather than retroactively creating a missed execution.

No `qra.reconcile` command or new timer is proposed. The 22 historical incidents tied to the retired generic 04:00 expectation require evidence-scoped, per-incident resolution after the new contract is deployed; new reconcile events cannot clear those historical rows.

## Consequences

- Operators see scheduled execution, read-only daily verification, monthly completeness audit, and explicit recovery as separate responsibilities.
- Neo AVO gains reliable reconcile-specific visibility and missed-reconcile monitoring without owning QRA's execution schedule.
- QRA and Neo AVO require a coordinated telemetry rollout and a 14-day, evidence-based compatibility period.
- Production rollout is authorized by the user's explicit instruction on 2026-10-07 and remains subject to final Agent B review and operational verification.
