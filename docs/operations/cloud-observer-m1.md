# Cloud Observer M1 Operations

M1 is read-only provider wiring. `CLOUD_OBSERVER_ENABLED` remains false by
default and no IAM changes are part of this change.

## AWS

The observer uses the official Lightsail and Cost Explorer APIs. The runtime
identity needs, at minimum:

- `lightsail:GetInstances`
- `lightsail:GetInstanceMetricData`
- `ce:GetCostAndUsage`

Use a region-scoped read-only role where the deployment policy permits it.
`AWS_REGION` is required; `AWS_ACCOUNT_ID` is recommended for normalized
identity metadata. Promotional credit remaining is `UNKNOWN` because it is not
reliably exposed by these APIs.

## GCP

Infrastructure uses the official Compute Engine and Cloud Monitoring APIs with
a server-side credential carrying `compute.instances.list` and
`monitoring.timeSeries.list` (for example, Compute Viewer plus Monitoring
Viewer) and the Cloud Platform read-only OAuth scope.

Project-level detailed cost is `UNAVAILABLE` unless a supported Cloud Billing
export is already configured. M1 does not create BigQuery infrastructure or
pretend that Cloud Billing APIs provide real-time detailed cost. Promotional
credit remaining is `UNKNOWN` unless a reliable supported source is configured.

No credential values, tokens, service-account JSON, or credential paths are
returned by the observer API or written to observer storage.
