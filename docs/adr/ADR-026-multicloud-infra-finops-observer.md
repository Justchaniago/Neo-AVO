# ADR-026: Multi-Cloud Infrastructure & FinOps Observer

**Status:** ACCEPTED

## Decision

Add an independently managed, read-only `neo-avo-cloud-observer` lifecycle.
It polls optional AWS and GCP provider adapters, normalizes observations, and
writes only observer-owned PostgreSQL tables. The web and production worker do
not import or depend on the observer. `CLOUD_OBSERVER_ENABLED=false` is the
default.

Infrastructure, cost, and credits use separate bounded polling cadences. Each
provider and capability fails independently; the last known snapshot remains
available and freshness/status make unavailable data explicit. Financial
values are never converted from unknown to zero.

The Infrastructure page read path consumes observer snapshots through a
server-side API; it never calls cloud providers directly.

## Consequences

The observer is a new systemd service and owns four new snapshot/state tables.
Provider credentials remain server-side. M0 intentionally does not implement
alerts, incidents, forecasting beyond deterministic month-end projection,
remediation, or console scraping. Provider APIs may report `UNKNOWN`,
`UNAVAILABLE`, `UNAUTHORIZED`, `STALE`, or `ERROR` when evidence is absent.
