"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "../icons";
import { type ProjectDetail } from "../model";
import { Availability, Badge, Facts, Time, Panel } from "../primitives";
import { IncidentRows, OperationalTimeline } from "../operational";
import { CommandConfirmationSheet, type BoundedActionParams } from "./confirmation";

export function MobileProjectDetail({
  id,
  data,
  refresh,
}: {
  id: string;
  data: ProjectDetail;
  refresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "timeline" | "commands" | "repo"
  >("overview");
  const [confirmParams, setConfirmParams] = useState<BoundedActionParams | null>(null);

  const project = data.project;
  const isEventDriven = project.healthStrategy === "execution_based" && project.runtimeMode === "on_demand" && !project.expectedIntervalSeconds;

  const executeCommand = (capability: string, args?: Record<string, unknown>) => {
    setConfirmParams({
      actionName: `Command: ${capability}`,
      target: `Project ${project.name} [${project.environment}]`,
      scope: `Capability: ${capability}`,
      expectedSideEffect: `Will request execution of bounded capability '${capability}' for project ${project.id}.`,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/commands`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            environment: project.environment,
            capability,
            arguments: args || {},
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Command submission rejected.");
        }
        refresh();
      },
    });
  };

  return (
    <div className="mobile-project-detail">
      {/* Top Header */}
      <div className="mobile-project-header">
        <Link href="/projects" className="mobile-back-link">
          <Icon name="arrow" /> Back to Projects
        </Link>
        <h1 className="mobile-project-title">{project.name}</h1>
        <p className="eyebrow">
          {project.slug} · Environment: {project.environment}
        </p>
      </div>

      {/* Three Health Dimensions Summary */}
      <div className="mobile-card health-dimensions-card">
        <h2 className="eyebrow">Independent Health Dimensions</h2>
        <div className="mobile-facts-grid">
          <div>
            <span className="fact-label">AVAILABILITY</span>
            <Availability value={project.availability} />
          </div>
          <div>
            <span className="fact-label">OPERATIONAL HEALTH</span>
            <Badge value={project.operationalHealth} />
          </div>
          <div>
            <span className="fact-label">BUSINESS HEALTH</span>
            <Badge value={project.businessHealth} />
          </div>
        </div>

        <div className="execution-timing-block">
          <Facts
            rows={[
              ["Last Runtime Signal", <Time key="lst" value={project.lastSeenAt} />],
              ["Last Operational", <Time key="lo" value={project.lastOperationalAt} />],
              ["Last Business Proof", <Time key="lse" value={project.lastSuccessfulExecutionAt} />],
              ["Next Expected Execution", isEventDriven ? "Event-driven (No scheduled cron)" : project.expectedNextExecutionAt ? <Time key="nee" value={project.expectedNextExecutionAt} /> : "Not scheduled"],
              ["Runtime Mode", project.runtimeMode],
              ["Health Strategy", project.healthStrategy],
            ]}
          />
        </div>
      </div>

      {/* Tab Controls */}
      <div className="mobile-tab-bar">
        {(
          [
            ["overview", "Overview"],
            ["timeline", "Timeline"],
            ["commands", "Commands"],
            ["repo", "Repo & Deps"],
          ] as const
        ).map(([tabKey, label]) => (
          <button
            key={tabKey}
            type="button"
            className={`mobile-tab-btn ${activeTab === tabKey ? "active" : ""}`}
            onClick={() => setActiveTab(tabKey)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {activeTab === "overview" && (
        <div className="mobile-tab-content">
          {/* Active Incidents */}
          <section className="mobile-section">
            <h2 className="mobile-section-title">01 / Active Attention</h2>
            {data.incidents && data.incidents.length > 0 ? (
              <IncidentRows incidents={data.incidents} />
            ) : (
              <div className="mobile-card">
                <p className="muted">No active incidents for this project.</p>
              </div>
            )}
          </section>

          {/* Tasks */}
          <section className="mobile-section">
            <h2 className="mobile-section-title">02 / Recent Tasks</h2>
            <div className="mobile-card">
              {data.tasks && data.tasks.length > 0 ? (
                <Facts
                  rows={data.tasks.slice(0, 5).map((t) => [
                    `Task ${t.externalTaskId.slice(0, 10)}`,
                    `Status: ${t.status} (Attempt ${t.currentAttempt})`,
                  ])}
                />
              ) : (
                <p className="muted">No task records found.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="mobile-tab-content">
          <section className="mobile-section">
            <h2 className="mobile-section-title">Operational Timeline</h2>
            <div className="mobile-card">
              {data.timeline ? (
                <OperationalTimeline items={data.timeline.items} />
              ) : (
                <p className="muted">No timeline items recorded.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "commands" && (
        <div className="mobile-tab-content">
          <section className="mobile-section">
            <h2 className="mobile-section-title">Bounded Commands</h2>
            <div className="mobile-card">
              <p className="muted" style={{ marginBottom: "12px" }}>
                Execute verified bounded commands against {project.name}.
              </p>

              {project.capabilities && project.capabilities.length > 0 ? (
                <div className="mobile-command-list">
                  {project.capabilities.map((cap) => (
                    <button
                      key={cap}
                      type="button"
                      className="button button-secondary"
                      style={{ width: "100%", justifyContent: "space-between", marginBottom: "8px" }}
                      onClick={() => executeCommand(cap)}
                    >
                      <span>{cap}</span>
                      <Icon name="arrow" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">No bounded capabilities configured for this project.</p>
              )}

              {data.commands && data.commands.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <h3 className="eyebrow">Recent Command History</h3>
                  <Facts
                    rows={data.commands.slice(0, 5).map((c) => [
                      c.capability,
                      `Status: ${c.status}`,
                    ])}
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "repo" && (
        <div className="mobile-tab-content">
          <section className="mobile-section">
            <h2 className="mobile-section-title">Dependencies & Repository</h2>
            <div className="mobile-card">
              <h3 className="eyebrow">Dependencies</h3>
              {data.dependencies && data.dependencies.length > 0 ? (
                <Facts
                  rows={data.dependencies.map((d: any) => [
                    d.dependencyKey || "Dependency",
                    d.status || "Healthy",
                  ])}
                />
              ) : (
                <p className="muted">No explicit project dependencies registered.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {confirmParams && (
        <CommandConfirmationSheet
          params={confirmParams}
          onClose={() => setConfirmParams(null)}
        />
      )}
    </div>
  );
}
