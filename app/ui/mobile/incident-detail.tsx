"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "../icons";
import { type IncidentDetail } from "../model";
import { Badge, Facts, Time, Copy } from "../primitives";
import { AnalysisContent, IncidentContent, OperationalTimeline } from "../operational";
import { CommandConfirmationSheet, type BoundedActionParams } from "./confirmation";

export function MobileIncidentDetail({
  id,
  data,
  refresh,
  ack,
  resolve,
}: {
  id: string;
  data: IncidentDetail;
  refresh: () => void;
  ack: () => Promise<void>;
  resolve: (note: string) => Promise<void>;
}) {
  const [acking, setAcking] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [confirmParams, setConfirmParams] = useState<BoundedActionParams | null>(null);

  const incident = data.incident;
  const analysis = data.analysis;
  const isResolved = incident.state === "RESOLVED";
  const isAcked = !!incident.acknowledgedAt || incident.state === "ACKNOWLEDGED";
  const hasRecovery = data.evidence?.some((e) => e.linkedAt) || false;

  const handleAck = async () => {
    setAcking(true);
    try {
      await ack();
      refresh();
    } finally {
      setAcking(false);
    }
  };

  const promptManualResolve = () => {
    setConfirmParams({
      actionName: "Manual Incident Resolution",
      target: `Incident ${incident.id.slice(0, 8)} (${incident.type})`,
      scope: `Project: ${incident.projectId} [${incident.environment}]`,
      expectedSideEffect:
        "Will mark incident state as RESOLVED. Note: Manual resolution will not fabricate missing machine recovery evidence.",
      onConfirm: async () => {
        await resolve(resolveNote || "Manually resolved via mobile console.");
        refresh();
      },
    });
  };

  const copyEscalationPackage = () => {
    const pkg = [
      `[NEO AVO INCIDENT ESCALATION]`,
      `ID: ${incident.id}`,
      `Project: ${incident.projectId} (${incident.environment})`,
      `Severity: ${incident.severity}`,
      `State: ${incident.state}`,
      `Reason: ${incident.reason}`,
      `First Seen: ${incident.firstSeenAt}`,
      `Last Seen: ${incident.lastSeenAt}`,
      analysis?.summary ? `AI Summary: ${analysis.summary}` : "",
      analysis?.likelyCause ? `Likely Cause: ${analysis.likelyCause}` : "",
    ].filter(Boolean).join("\n");
    return pkg;
  };

  return (
    <div className="mobile-incident-detail">
      {/* 1. Header: Severity / Status / Time */}
      <div className="mobile-incident-header">
        <Link href="/incidents" className="mobile-back-link">
          <Icon name="arrow" /> Back to Incidents
        </Link>
        <div className="mobile-incident-pills">
          <Badge value={incident.severity} />
          <Badge value={incident.state} />
          <Time value={incident.lastSeenAt} />
        </div>
        <h1 className="mobile-incident-title">
          {incident.type.replaceAll("_", " ")}
        </h1>
        <p className="eyebrow">Project: {incident.projectId} · Env: {incident.environment}</p>
      </div>

      {/* 2. What Happened & Reason */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">01 / What Happened</h2>
        <div className="mobile-card">
          <p className="mobile-card-lead">{incident.reason}</p>
          <Facts
            rows={[
              ["First Seen", <Time key="fs" value={incident.firstSeenAt} />],
              ["Last Seen", <Time key="ls" value={incident.lastSeenAt} />],
              ["Occurrences", String(incident.occurrenceCount)],
              ["Dependency Key", incident.dependencyKey || "None"],
            ]}
          />
        </div>
      </section>

      {/* 3. Business Impact */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">02 / Business Impact</h2>
        <div className="mobile-card">
          <p>
            {analysis?.impact ||
              (incident.severity === "CRITICAL" || incident.severity === "HIGH"
                ? "High risk of service degradation or workflow failure across dependent systems."
                : "Operational anomaly observed. Monitored project functionality may be partially degraded.")}
          </p>
        </div>
      </section>

      {/* 4. AI Assessment (Ops Analyst) */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">03 / AI Advisory Assessment</h2>
        {analysis ? (
          <div className="mobile-card surface-purple">
            <AnalysisContent detail={data} />
          </div>
        ) : (
          <div className="mobile-card surface-neutral">
            <p className="muted">No advisory AI analysis available for this incident yet.</p>
          </div>
        )}
      </section>

      {/* 5. Recommended Investigation Steps */}
      {analysis?.recommendedChecks && analysis.recommendedChecks.length > 0 && (
        <section className="mobile-section">
          <h2 className="mobile-section-title">04 / Recommended Investigation</h2>
          <div className="mobile-card">
            <ul className="mobile-checks-list">
              {analysis.recommendedChecks.map((check, idx) => (
                <li key={idx}>
                  <Icon name="arrow" /> {check}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 6. Machine Evidence */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">05 / Machine Evidence</h2>
        <div className="mobile-card">
          {data.evidence && data.evidence.length > 0 ? (
            <Facts
              rows={data.evidence.map((ev) => [
                `Event ${ev.eventId.slice(0, 8)}`,
                <Time key={ev.id} value={ev.linkedAt} />,
              ])}
            />
          ) : (
            <p className="muted">No explicit event markers linked directly to this record.</p>
          )}
        </div>
      </section>

      {/* 7. Recovery State */}
      <section className="mobile-section">
        <h2 className="mobile-section-title">06 / Recovery Evidence</h2>
        <div className="mobile-card">
          {isResolved ? (
            <div>
              <p><strong>Resolved at:</strong> <Time value={incident.resolvedAt} /></p>
              <p><strong>Resolution Reason:</strong> {incident.resolutionReason || "Manually resolved."}</p>
            </div>
          ) : hasRecovery ? (
            <p className="lime-text">Machine telemetry indicates recovery signals have been observed.</p>
          ) : (
            <p className="muted">No automated recovery signal confirmed yet.</p>
          )}
        </div>
      </section>

      {/* 8. Operational Timeline */}
      {data.timeline && data.timeline.items.length > 0 && (
        <section className="mobile-section">
          <h2 className="mobile-section-title">07 / Operational Timeline</h2>
          <div className="mobile-card">
            <OperationalTimeline items={data.timeline.items} />
          </div>
        </section>
      )}

      {/* Lifecycle Action Bar */}
      <div className="mobile-action-bar">
        {!isResolved ? (
          <div className="mobile-action-group">
            {!isAcked && (
              <button
                type="button"
                className="button button-primary"
                onClick={handleAck}
                disabled={acking}
              >
                {acking ? "Acknowledging..." : "Acknowledge Incident"}{" "}
                <Icon name="arrow" />
              </button>
            )}

            {isAcked && (
              <>
                <Copy value={copyEscalationPackage()} label="Escalation Package" />
                <div style={{ marginTop: "8px" }}>
                  <input
                    type="text"
                    placeholder="Resolution note (optional)…"
                    value={resolveNote}
                    onChange={(e) => setResolveNote(e.target.value)}
                    className="mobile-input"
                  />
                  <button
                    type="button"
                    className="button button-coral"
                    style={{ width: "100%", marginTop: "6px" }}
                    onClick={promptManualResolve}
                  >
                    Resolve Incident <Icon name="arrow" />
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mobile-resolved-banner">
            <Icon name="arrow" /> Incident is RESOLVED (Read-only historical state)
          </div>
        )}
      </div>

      {confirmParams && (
        <CommandConfirmationSheet
          params={confirmParams}
          onClose={() => setConfirmParams(null)}
        />
      )}
    </div>
  );
}
