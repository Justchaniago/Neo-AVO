"use client";

import { Icon } from "./icons";

import Link from "next/link";
import { AcknowledgeIncident } from "./existing-controls";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useDashboard, useRead } from "./data";
import {
  type Project,
  type ScopedActivity,
  type Incident,
  type IncidentDetail,
  activityMatches,
  eventLabel,
  meaningful,
  runTimeline,
  tone,
} from "./model";
import {
  Availability,
  Badge,
  Copy,
  Empty,
  ErrorState,
  Facts,
  Loading,
  Overlay,
  Panel,
  Time,
} from "./primitives";

export function ProjectCard({ project: p }: { project: Project }) {
  return (
    <article className="project-card">
      <div className="project-card-top">
        <span className="project-monogram">
          {p.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="eyebrow">{p.environment}</span>
        <Link
          className="square-link"
          href={`/projects/${p.id}`}
          aria-label={`Open ${p.name}`}
        >
          <Icon name="arrow" />
        </Link>
      </div>
      <h3>
        <Link href={`/projects/${p.id}`}>{p.name}</Link>
      </h3>
      <p className="muted">
        {p.runtimeMode.replaceAll("_", " ")} ·{" "}
        {p.healthStrategy.replaceAll("_", " ")}
      </p>
      <div className="status-pair">
        <Availability value={p.availability} />
        <Badge value={p.operationalHealth} />
      </div>
      <div className="project-last">
        <span>LAST SEEN</span>
        <Time value={p.lastSeenAt} />
      </div>
    </article>
  );
}
export function IncidentRows({
  incidents,
  limit,
}: {
  incidents: Incident[];
  limit?: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { projects } = useDashboard();
  return (
    <>
      <div className="incident-list">
        {incidents.slice(0, limit).map((i) => (
          <button
            className={`incident-row surface-${i.state === "RESOLVED" ? "white" : tone(i.severity)}`}
            key={i.id}
            onClick={() => setSelected(i.id)}
          >
            <div>
              <span className="eyebrow">
                {projects.data?.projects.find((p) => p.id === i.projectId)
                  ?.name || i.projectId}{" "}
                / {i.environment}
              </span>
              <h3>{eventLabel(i.type)}</h3>
              <p>{i.reason}</p>
              <span className="muted">
                <Time value={i.lastSeenAt} /> · {i.occurrenceCount}{" "}
                occurrence(s)
              </span>
            </div>
            <div className="row-state">
              <Badge value={i.severity} />
              <span className="eyebrow">{i.state}</span>
              <span>Inspect <Icon name="arrow" /></span>
            </div>
          </button>
        ))}
      </div>
      {selected && (
        <Overlay title="Incident inspector" onClose={() => setSelected(null)}>
          <IncidentContent id={selected} />
          <Link className="button" href={`/incidents/${selected}`}>
            Open incident page <Icon name="arrow" />
          </Link>
        </Overlay>
      )}
    </>
  );
}
export function AnalysisContent({ detail }: { detail: IncidentDetail }) {
  const a = detail.analysis;
  return (
    <Panel
      color="purple"
      title="Ops analyst"
      label="AI interpretation / advisory"
    >
      {!a ? (
        <Empty title="No analysis available">
          Analysis appears here when produced for this incident. Machine facts
          remain authoritative.
        </Empty>
      ) : a.status !== "SUCCEEDED" ? (
        <>
          <Badge value={a.status} />
          <p>No completed analysis is available for this incident.</p>
        </>
      ) : (
        <>
          <h3>{a.summary}</h3>
          <Facts
            rows={[
              ["Likely cause", a.likelyCause],
              ["Impact", a.impact],
              [
                "Confidence",
                a.confidence === null
                  ? "Unknown"
                  : `${(a.confidence / 100).toFixed(1)}%`,
              ],
              ["Completed", <Time key="completed" value={a.completedAt} />],
            ]}
          />
          {a.recommendedActions.length > 0 && (
            <>
              <p className="eyebrow">Suggested investigation / not executed</p>
              <ul>
                {a.recommendedActions.map((r, index) => (
                  <li key={index}>
                    <strong>{r.capability}</strong> — {r.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Panel>
  );
}
export function IncidentContent({ id }: { id: string }) {
  const { revision, refresh, projects } = useDashboard();
  const result = useRead<IncidentDetail>(
    `/api/v1/dashboard/incidents/${encodeURIComponent(id)}`,
    revision,
  );
  if (result.error)
    return <ErrorState retry={refresh}>{result.error}</ErrorState>;
  if (!result.data) return <Loading />;
  const { incident: i, evidence } = result.data;
  return (
    <div className="stack">
      <Panel
        color={i.state === "RESOLVED" ? "white" : tone(i.severity)}
        label="Machine truth / incident record"
        title={eventLabel(i.type)}
      >
        <div className="status-pair">
          <Badge value={i.severity} />
          <Badge value={i.state} />
        </div>
        <p>{i.reason}</p>
        <details className="evidence-details"><summary>Incident identifier</summary><Copy value={i.id} label="incident ID" /></details>
        <Facts
          rows={[
            [
              "Project",
              <Link key="project" href={`/projects/${i.projectId}`}>
                {projects.data?.projects.find(project => project.id === i.projectId)?.name || "View project"} <Icon name="arrow" />
              </Link>,
            ],
            ["Environment", i.environment],
            ["First seen", <Time key="first" value={i.firstSeenAt} />],
            ["Last seen", <Time key="last" value={i.lastSeenAt} />],
            ["Occurrences", i.occurrenceCount],
            ["Dependency", i.dependencyKey],
            ["Recovery", i.resolutionReason || "No recovery recorded"],
            ["Resolved", <Time key="resolved" value={i.resolvedAt} />],
          ]}
        />
        {i.state === "OPEN" && <AcknowledgeIncident id={i.id} />}
      </Panel>
      <Panel title="Linked evidence" label="Normalized event references">
        {evidence.length ? (
          evidence.map((e) => (
            <div className="evidence" key={e.id}>
              <Copy value={e.eventId} label="event ID" />
              <Time value={e.linkedAt} />
            </div>
          ))
        ) : (
          <Empty title="No linked events">
            No event references are available for this incident.
          </Empty>
        )}
      </Panel>
      <AnalysisContent detail={result.data} />
    </div>
  );
}
export function ActivityFeed({
  events,
  compact = false,
  initialQuery = "",
}: {
  events: ScopedActivity[];
  compact?: boolean;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [project, setProject] = useState("");
  const [status, setStatus] = useState("");
  const [context, setContext] = useState("");
  const pathname = usePathname();
  const storageKey = `avo:activity-filters:${pathname}`;
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (compact) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (saved && typeof saved.project === "string" && typeof saved.status === "string") {
        setProject(saved.project); setStatus(saved.status);
      }
    } catch { /* Storage is optional, including in private browsing. */ }
    setRestored(true);
  }, [compact, storageKey]);
  useEffect(() => {
    if (!compact && restored) {
      try { sessionStorage.setItem(storageKey, JSON.stringify({ project, status })); } catch { /* Optional preference storage. */ }
    }
  }, [compact, restored, storageKey, project, status]);
  const [displayed, setDisplayed] = useState(events);
  const [updated, setUpdated] = useState(false);
  const displayedIds = new Set(displayed.map(e => `${e.project.id}:${e.id}`));
  const incoming = events.filter(e => meaningful(e) && !displayedIds.has(`${e.project.id}:${e.id}`)).length;
  const latest = new Map(events.map(event => [`${event.project.id}:${event.id}`, event]));
  const currentEvents = compact ? events : displayed.map(event => latest.get(`${event.project.id}:${event.id}`) || event);
  const [selection, setSelected] = useState<ScopedActivity | null>(null);
  const selected = selection ? latest.get(`${selection.project.id}:${selection.id}`) || selection : null;
  const visible = currentEvents.filter(meaningful);
  const filtered = visible.filter(
    (e) =>
      activityMatches(e, query) &&
      (!project || e.project.id === project) &&
      (!status || (e.severity || e.status || "") === status) &&
      (!context || [e.store, e.domain].includes(context)),
  );
  return (
    <>
      {!compact && incoming > 0 && <div className="activity-update" role="status"><button onClick={() => { setDisplayed(events); setUpdated(true); }}>{incoming} new {incoming === 1 ? "event" : "events"} — show updates <Icon name="refresh" /></button><span>Your current view is preserved.</span></div>}
      {!compact && (query || project || status || context) && <button className="button-small clear-filters" onClick={() => { setQuery(""); setProject(""); setStatus(""); setContext(""); }}>Clear filters</button>}
      {!compact && (
        <div className="filters">
          <label>
            <span>Search activity</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Event, run ID, context…"
            />
          </label>
          <label>
            <span>Project</span>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">All projects</option>
              {Array.from(
                new Map(visible.map((e) => [e.project.id, e.project])).values(),
              ).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>State / severity</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All states</option>
              {Array.from(
                new Set(
                  visible.map((e) => e.severity || e.status).filter(Boolean),
                ),
              ).map((s) => (
                <option key={s} value={s!}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Context</span>
            <select
              value={context}
              onChange={(e) => setContext(e.target.value)}
            >
              <option value="">All contexts</option>
              {Array.from(
                new Set(
                  visible.flatMap((e) => [e.store, e.domain]).filter(Boolean),
                ),
              ).map((c) => (
                <option key={c} value={c!}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {!filtered.length ? (
        <Empty
          title={visible.length ? "No matching activity" : "No recent activity"}
        >
          {visible.length
            ? "Try another search or clear the filters."
            : "Normalized operational events will appear when reported. Heartbeats are reflected in availability."}
        </Empty>
      ) : (
        <div className={`activity-list ${updated ? "just-updated" : ""}`} onAnimationEnd={() => setUpdated(false)}>
          {filtered.slice(0, compact ? 6 : undefined).map((e) => (
            <button
              className="activity-row"
              key={`${e.project.id}:${e.id}`}
              onClick={() => setSelected(e)}
            >
              <span
                className={`event-symbol tone-${tone(e.severity || e.status || "INFO")}`}
                aria-hidden="true"
              >
                <Icon name="arrow" />
              </span>
              <div>
                <strong>{eventLabel(e.type)}</strong>
                <span className="muted">
                  {e.project.name}
                  {[e.store, e.domain].filter(Boolean).length
                    ? ` / ${[e.store, e.domain].filter(Boolean).join(" / ")}`
                    : ""}
                </span>
              </div>
              <div className="activity-meta">
                {(e.status || e.severity) && (
                  <Badge value={e.severity || e.status!} />
                )}
                <Time value={e.occurredAt} />
              </div>
              <span aria-hidden="true"><Icon name="arrow" /></span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <Overlay
          title={selected.runId ? "Run / event inspector" : "Event inspector"}
          onClose={() => setSelected(null)}
        >
          <p className="eyebrow">Machine truth / reported event</p>
          <h2>{eventLabel(selected.type)}</h2>
          <div className="status-pair">
            {selected.status && <Badge value={selected.status} />}
            {selected.severity && <Badge value={selected.severity} />}
          </div>
          <details className="evidence-details"><summary>Evidence identifiers</summary><Copy value={selected.eventId} label="event ID" />
          {selected.runId && <Copy value={selected.runId} label="run ID" />}</details>
          <Facts
            rows={[
              [
                "Project",
                <Link key="p" href={`/projects/${selected.project.id}`}>
                  {selected.project.name} <Icon name="arrow" />
                </Link>,
              ],
              [
                "Context",
                [selected.store, selected.domain].filter(Boolean).join(" / ") ||
                  "Not reported",
              ],
              ["Occurred", <Time key="o" value={selected.occurredAt} />],
              ["Received", <Time key="r" value={selected.receivedAt} />],
            ]}
          />
          <h3>Observed timeline</h3>
          <p className="muted">
            Available recent events only; lifecycle may be incomplete.
          </p>
          <ol className="timeline">
            {runTimeline(events, selected).map((e) => (
              <li key={e.id}>
                <strong>{eventLabel(e.type)}</strong>
                <Time value={e.occurredAt} />
              </li>
            ))}
          </ol>
          <Link
            className="button"
            href={`/incidents?project=${encodeURIComponent(selected.project.id)}`}
          >
            Investigate project incidents <Icon name="arrow" />
          </Link>
        </Overlay>
      )}
    </>
  );
}
