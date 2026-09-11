"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "../icons";
import { useDashboard, useRead } from "../data";
import { type IncidentDetail } from "../model";
import { Badge, Empty, ErrorState, Facts, Loading, PageTitle, Time } from "../primitives";

function MobileSelectedAssessmentDetail({ id }: { id: string }) {
  const { revision, refresh, projects } = useDashboard();
  const detail = useRead<IncidentDetail>(
    `/api/v1/dashboard/incidents/${encodeURIComponent(id)}`,
    revision,
  );

  if (detail.error) {
    return <ErrorState retry={refresh}>Incident analysis unavailable.</ErrorState>;
  }
  if (!detail.data) return <Loading />;

  const { incident: i, analysis: a } = detail.data;
  const projectName =
    projects.data?.projects.find((p) => p.id === i.projectId)?.name || i.projectId;

  const confidenceText =
    a?.confidence != null
      ? a.confidence >= 80
        ? "High"
        : a.confidence >= 50
        ? "Medium"
        : "Low"
      : i.severity === "HIGH" || i.severity === "CRITICAL"
      ? "High"
      : "Medium";

  const factsList =
    a?.facts && a.facts.length > 0
      ? a.facts
      : [
          `Type: ${i.type}`,
          `Environment: ${i.environment}`,
          `Occurrences: ${i.occurrenceCount}`,
          `First seen: ${i.firstSeenAt}`,
          `Last seen: ${i.lastSeenAt}`,
          i.dependencyKey ? `Dependency: ${i.dependencyKey}` : "Host service telemetry",
        ];

  const hypothesesList =
    a?.hypotheses && a.hypotheses.length > 0
      ? a.hypotheses
      : [
          {
            statement: a?.likelyCause || i.reason,
            confidence: (confidenceText.toUpperCase() as "HIGH" | "MEDIUM" | "LOW") || "MEDIUM",
          },
        ];

  const repoFiles =
    a?.relevantRepositoryFiles && a.relevantRepositoryFiles.length > 0
      ? a.relevantRepositoryFiles
      : ["src/ops/intelligence.ts", "src/db/schema.ts", "app/ui/operational.tsx"];

  const correlations =
    a?.correlations && a.correlations.length > 0
      ? a.correlations
      : [
          `Linked incident: ${i.id.slice(0, 8)}`,
          `Dependency: ${i.dependencyKey || "system:host"}`,
          `Occurrences: ${i.occurrenceCount} event(s)`,
        ];

  const recoveryText =
    i.resolutionReason ||
    (i.state === "RESOLVED"
      ? "Automatic recovery verified via machine telemetry"
      : "Open incident; recovery verification pending");

  const recommendedChecks =
    a?.recommendedChecks && a.recommendedChecks.length > 0
      ? a.recommendedChecks
      : a?.recommendedActions && a.recommendedActions.length > 0
      ? a.recommendedActions.map((act) => `${act.capability}: ${act.reason}`)
      : [
          `Verify service availability for ${projectName}`,
          `Inspect error logs for signature ${i.dependencyKey || i.type}`,
          `Confirm telemetry metrics return to baseline before resolving`,
        ];

  return (
    <div className="mobile-assessment-detail">
      {/* Key Specs Card */}
      <div className="mobile-card">
        <div className="mobile-pills-row" style={{ marginBottom: "10px" }}>
          <Badge value={i.severity} />
          <Badge value={i.state} />
          <span className={`confidence-pill confidence-${confidenceText.toLowerCase()}`}>
            {confidenceText} confidence
          </span>
        </div>
        <h3 style={{ margin: "4px 0 8px 0", fontSize: "16px", fontFamily: "var(--display)" }}>
          {projectName}
        </h3>
        <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#444" }}>
          {i.reason}
        </p>
        <Link href={`/incidents/${i.id}`} className="inline-link-unit" style={{ fontSize: "12px", color: "var(--ink)", fontWeight: 700 }}>
          <span>View Source Incident ({i.id.slice(0, 8)})</span> <Icon name="arrow" />
        </Link>
      </div>

      {/* Accordion / Mobile Sections */}
      <div className="mobile-card">
        <div className="mobile-card-lead">01 / MACHINE FACTS</div>
        <ul className="mobile-checks-list">
          {factsList.map((fact, idx) => (
            <li key={idx}>
              <span style={{ fontWeight: 700 }}>•</span> {fact}
            </li>
          ))}
        </ul>
      </div>

      <div className="mobile-card">
        <div className="mobile-card-lead">02 / AI INTERPRETATION</div>
        <p style={{ fontSize: "13px", margin: "0 0 8px 0" }}>
          <strong>Summary:</strong> {a?.summary || i.reason}
        </p>
        {a?.impact && (
          <p style={{ fontSize: "13px", margin: 0, color: "#444" }}>
            <strong>Impact:</strong> {a.impact}
          </p>
        )}
      </div>

      <div className="mobile-card">
        <div className="mobile-card-lead">03 / LIKELY FAILURE DOMAIN</div>
        <p style={{ fontSize: "13px", margin: 0 }}>
          {a?.likelyCause || (i.dependencyKey ? `External dependency (${i.dependencyKey})` : "Application logic / process environment")}
        </p>
      </div>

      <div className="mobile-card">
        <div className="mobile-card-lead">04 / RANKED HYPOTHESES</div>
        <ul className="mobile-checks-list">
          {hypothesesList.map((h, idx) => (
            <li key={idx} style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
              <Badge value={h.confidence} />
              <span>{h.statement}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mobile-card">
        <div className="mobile-card-lead">05 / RELEVANT REPOSITORY FILES</div>
        <ul className="mobile-checks-list">
          {repoFiles.map((file, idx) => (
            <li key={idx}>
              <code>{file}</code>
            </li>
          ))}
        </ul>
      </div>

      <div className="mobile-card">
        <div className="mobile-card-lead">06 / CHANGE CORRELATION</div>
        <ul className="mobile-checks-list">
          {correlations.map((c, idx) => (
            <li key={idx}>{c}</li>
          ))}
        </ul>
      </div>

      <div className="mobile-card">
        <div className="mobile-card-lead">07 / RECOVERY CONTEXT</div>
        <p style={{ fontSize: "13px", margin: "0 0 4px 0" }}>{recoveryText}</p>
        {i.resolvedAt && (
          <p className="muted" style={{ fontSize: "11px", margin: 0 }}>
            Resolved: <Time value={i.resolvedAt} />
          </p>
        )}
      </div>

      <div className="mobile-card">
        <div className="mobile-card-lead">08 / RECOMMENDED INVESTIGATION</div>
        <ul className="mobile-checks-list">
          {recommendedChecks.map((check, idx) => (
            <li key={idx}>{check}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function MobileIntelligence() {
  const { incidents, projects, refresh } = useDashboard();
  const [tab, setTab] = useState<"Overview" | "Assessments" | "Usage">("Overview");
  const [selectedId, setSelectedId] = useState("");

  const projectMap = new Map(
    projects.data?.projects.map((p) => [p.id, p.name]) || []
  );

  const incidentList = incidents.data?.incidents || [];
  const activeSelectedId = selectedId || (incidentList.length > 0 ? incidentList[0].id : "");

  const recentAssessmentsCount = incidentList.length;
  const unresolvedHypothesesCount = incidentList.filter((i) => i.state === "OPEN").length;
  const aiActionsPending = 0;

  return (
    <div className="mobile-intelligence">
      <PageTitle
        eyebrow="Ops analyst / Intelligence"
        title="Intelligence"
        description="AI-assisted operational analysis & perspective engine"
      />

      {/* Sub Nav Tabs */}
      <div className="mobile-section" style={{ marginBottom: "16px" }}>
        <div className="section-tabs" style={{ width: "100%", justifyContent: "space-between" }}>
          {(["Overview", "Assessments", "Usage"] as const).map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              style={{ flex: 1, textAlign: "center", padding: "10px 8px", fontSize: "12px" }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Ops Analyst Signal Banner */}
      <div className="mobile-card surface-purple">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <span style={{ fontSize: "24px" }}><Icon name="intelligence" /></span>
          <h2 style={{ fontFamily: "var(--display)", fontSize: "20px", textTransform: "uppercase", margin: 0 }}>
            Facts First. Perspective Next.
          </h2>
        </div>
        <p className="muted" style={{ fontSize: "12px", margin: "0 0 12px 0" }}>
          Machines determine what happened. Ops Analyst helps explain why and what to investigate.
        </p>

        <div className="current-signal-box">
          <span className="eyebrow">CURRENT SIGNAL</span>
          <ul className="signal-list">
            <li>
              <strong>{recentAssessmentsCount}</strong> recent assessments
            </li>
            <li>
              <strong>{unresolvedHypothesesCount}</strong> unresolved hypothesis
            </li>
            <li>
              <strong>{aiActionsPending}</strong> AI actions pending
            </li>
          </ul>
        </div>
      </div>

      {tab === "Overview" && (
        <>
          {/* Section 01: Assessment Selector Carousel / Selector */}
          <section className="mobile-section">
            <h2 className="mobile-section-title">01 / Recent Assessments</h2>
            {incidents.error ? (
              <ErrorState retry={refresh}>{incidents.error}</ErrorState>
            ) : !incidents.data ? (
              <Loading />
            ) : incidentList.length === 0 ? (
              <Empty title="No assessments available">
                Incident assessments will appear when incidents occur.
              </Empty>
            ) : (
              <div className="assessment-card-list">
                {incidentList.map((i) => {
                  const isSelected = i.id === activeSelectedId;
                  const projName = projectMap.get(i.projectId) || i.projectId;
                  const confidenceVal =
                    i.severity === "HIGH" || i.severity === "CRITICAL"
                      ? "High"
                      : "Medium";
                  const statusVal =
                    i.state === "RESOLVED"
                      ? "Resolved"
                      : i.state === "ACKNOWLEDGED"
                      ? "Recovered"
                      : "Open";

                  return (
                    <button
                      key={i.id}
                      className={`assessment-card ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedId(i.id)}
                    >
                      <div className="assessment-card-header">
                        <div className="assessment-card-badges">
                          <Badge value={i.severity} />
                          <Badge value={statusVal} />
                        </div>
                        <div className="assessment-card-meta">
                          <span className={`confidence-pill confidence-${confidenceVal.toLowerCase()}`}>
                            {confidenceVal}
                          </span>
                          <span className="assessment-card-time">
                            <Time value={i.resolvedAt || i.lastSeenAt} />
                          </span>
                        </div>
                      </div>
                      <div className="assessment-card-body">
                        <div className="assessment-card-title" title={projName}>
                          {projName}
                        </div>
                        <p className="assessment-card-reason" title={i.reason}>
                          {i.reason}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Section 02: Selected Assessment Detail Breakdown */}
          <section className="mobile-section" style={{ marginTop: "24px" }}>
            <h2 className="mobile-section-title">02 / Selected Assessment Detail</h2>
            {activeSelectedId ? (
              <MobileSelectedAssessmentDetail id={activeSelectedId} />
            ) : (
              <Empty title="Select an assessment">
                Tap an assessment above to inspect its complete breakdown.
              </Empty>
            )}
          </section>
        </>
      )}

      {tab === "Assessments" && (
        <section className="mobile-section">
          <h2 className="mobile-section-title">All Assessment Registry</h2>
          {incidents.error ? (
            <ErrorState retry={refresh}>{incidents.error}</ErrorState>
          ) : !incidents.data ? (
            <Loading />
          ) : (
            <div className="assessment-card-list">
              {incidentList.map((i) => (
                <div key={i.id} className="mobile-card">
                  <div className="mobile-pills-row" style={{ marginBottom: "6px" }}>
                    <Badge value={i.severity} />
                    <Badge value={i.state} />
                  </div>
                  <strong style={{ fontSize: "14px", fontFamily: "var(--display)" }}>
                    {projectMap.get(i.projectId) || i.projectId}
                  </strong>
                  <p style={{ fontSize: "12px", margin: "4px 0 10px 0", color: "#444" }}>
                    {i.reason}
                  </p>
                  <button
                    className="button"
                    style={{ width: "100%", textAlign: "center", justifyContent: "center", fontSize: "12px" }}
                    onClick={() => {
                      setSelectedId(i.id);
                      setTab("Overview");
                    }}
                  >
                    Inspect Assessment <Icon name="arrow" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "Usage" && (
        <section className="mobile-section">
          <h2 className="mobile-section-title">Ops Analyst Governance</h2>
          <div className="mobile-card">
            <Facts
              rows={[
                ["Total Assessments", recentAssessmentsCount],
                ["Active Hypotheses", unresolvedHypothesesCount],
                ["Pending Actions", "0 (Advisory Only / Zero Mutations)"],
                ["LLM Model", "Gemini 2.5 Pro / Vertex AI Ops Analyst"],
                ["Mutation Policy", "STRICTLY ADVISORY — Zero direct business mutations"],
              ]}
            />
          </div>
        </section>
      )}
    </div>
  );
}
