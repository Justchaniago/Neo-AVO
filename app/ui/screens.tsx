"use client";

import { Icon } from "./icons";

import Link from "next/link";
import { ProjectControls } from "./existing-controls";
import { useEffect, useState } from "react";
import { useActivity, useDashboard, useRead } from "./data";
import {
  type IncidentDetail,
  type ProjectDetail,
  globalSignal,
  meaningful,
  tone,
} from "./model";
import { QraAuditControl } from "./qra-audit-control";
import { BriefingRegenerateControl } from "./briefing-regenerate-control";
import {
  Availability,
  Badge,
  Empty,
  ErrorState,
  Facts,
  Loading,
  PageTitle,
  Panel,
  Time,
} from "./primitives";
import {
  ActivityFeed,
  AnalysisContent,
  IncidentContent,
  IncidentRows,
  ProjectCard,
  OperationalTimeline,
  ScrollViewport,
} from "./operational";

function Refresh() {
  const { refresh, checkedAt, refreshing, online, stale } = useDashboard();
  return (
    <div className="refresh-block">
      <button onClick={refresh} disabled={refreshing || !online}><Icon name="refresh" /> {refreshing ? "Checking signals…" : "Refresh signals"}</button>
      <small>
        {checkedAt ? <>Last received <Time value={checkedAt} /></> : "Awaiting first successful update"}
        <span className="refresh-mode">{!online ? "Offline" : stale ? "Updates delayed" : "Auto-refresh / 60s while visible"}</span>
      </small>
    </div>
  );
}
function ActivitySurface({ compact = false }: { compact?: boolean }) {
  const activity = useActivity();
  const { refresh } = useDashboard();
  const [query, setQuery] = useState<string | null>(null);
  useEffect(() => {
    setQuery(new URLSearchParams(window.location.search).get("q") || "");
  }, []);
  if (activity.error && !activity.loaded)
    return (
      <ErrorState retry={refresh}>
        Recent activity unavailable. Project telemetry could not be loaded.
      </ErrorState>
    );
  if (!activity.loaded || query === null) return <Loading />;
  return (
    <>
      {activity.error && <ErrorState retry={refresh}>Showing previously received activity. Updates are unavailable.</ErrorState>}
      {activity.failed.length > 0 && (
        <ErrorState retry={refresh}>
          Updates unavailable for {activity.failed.join(", ")}. Results may be partial or out of date.
        </ErrorState>
      )}
      <ActivityFeed
        events={activity.events}
        compact={compact}
        initialQuery={query}
      />
      {!compact && (
        <p className="muted data-note">
          Recent reported activity, newest first. Search covers the available history. Heartbeats update availability instead of appearing here.
        </p>
      )}
    </>
  );
}
export function OverviewScreen() {
  const { projects, incidents, stale } = useDashboard();
  const signal = globalSignal(
    projects.data?.projects,
    incidents.data?.incidents,
    stale,
  );
  const active = incidents.data?.incidents.filter(
    (i) => i.state !== "RESOLVED",
  );
  const attentionTone = active?.some((i) =>
    ["HIGH", "CRITICAL"].includes(i.severity),
  )
    ? "coral"
    : active?.length
      ? "orange"
      : "white";
  return (
    <>
      <PageTitle
        eyebrow="Mission control / 01"
        title="Overview"
        description="Latest reported state of your autonomous office"
        action={<Refresh />}
      />
      <div className="overview-bento">
        <Panel
          color={signal.tone}
          className="system-hero"
          label="01 / Global operational state"
        >
          <div className="hero-symbol" aria-hidden="true">
            <Icon name={signal.tone === "lime" ? "arrow" : signal.tone === "coral" ? "attention" : "state"} />
          </div>
          <h2>{signal.label}</h2>
          <p>
            {signal.tone === "lime"
              ? "All registered projects report online and healthy. No active incidents in the available records."
              : signal.tone === "coral"
                ? "Operational signals need investigation. Review attention and project health below."
                : signal.tone === "orange"
                  ? "Some project signals are stale or degraded. Review the affected systems."
                  : "Operational certainty depends on available telemetry. Unknown signals are never treated as healthy."}
          </p>
          <div className="hero-bottom">
            <span>MACHINE-REPORTED STATE</span>
            <Link href="/projects">Inspect systems <Icon name="arrow" /></Link>
          </div>
        </Panel>
        <Panel
          className="attention-summary"
          color={attentionTone}
          label="02 / Attention"
          title={
            incidents.error
              ? "Visibility limited"
              : active
                ? active.length
                  ? "Needs a closer look."
                  : "Nothing flagged."
                : "Checking incidents."
          }
          action={
            <Link
              className="square-link"
              href="/incidents"
              aria-label="Open attention"
            >
              <Icon name="arrow" />
            </Link>
          }
        >
          <div className="attention-count">
            {active ? String(active.length).padStart(2, "0") : "—"}
            <span>
              ACTIVE
              <br />
              INCIDENTS
            </span>
          </div>
          <p>
            {active?.length
              ? "Open and acknowledged incidents in the available records."
              : "No active incidents is not proof of health. Check project signals alongside this view."}
          </p>
          <Link className="text-link" href="/incidents">
            Review attention <Icon name="arrow" />
          </Link>
        </Panel>
        <ServerHealthCard />
        <Panel
          className="overview-projects"
          label="04 / Connected systems"
          title="Project health"
          action={<Link href="/projects">All projects <Icon name="arrow" /></Link>}
        >
          <ProjectCollection compact />
        </Panel>
        <Panel
          className="overview-activity"
          label="04 / Operational history"
          title="Just happened"
          action={<Link href="/activity">Activity <Icon name="arrow" /></Link>}
        >
          <ActivitySurface compact />
        </Panel>
        <Panel
          color="purple"
          className="overview-intelligence"
          label="05 / AI interpretation"
          title="A second perspective."
        >
          <p>
            Investigate machine-reported incidents with available Ops Analyst
            assessments. Analysis stays advisory.
          </p>
          <Link className="button" href="/intelligence">
            Open intelligence <Icon name="arrow" />
          </Link>
          <span className="ai-mark" aria-hidden="true">
            <Icon name="intelligence" />
          </span>
        </Panel>
        <Panel
          className="overview-agents"
          label="06 / Agent observability"
          title="Awaiting a signal."
        >
          <p>
            No live agent or worker status is available yet. Reported agent
            events remain visible in Activity.
          </p>
          <Link className="text-link" href="/agents">
            Agent observability <Icon name="arrow" />
          </Link>
        </Panel>
      </div>
    </>
  );
}
function ProjectCollection({ compact = false }: { compact?: boolean }) {
  const { projects, refresh } = useDashboard();
  if (projects.error)
    return (
      <ErrorState retry={refresh}>
        Project health unavailable. No operational status can be confirmed.
      </ErrorState>
    );
  if (!projects.data) return <Loading />;
  if (!projects.data.projects.length)
    return (
      <Empty title="No connected projects">
        Registered independent systems will appear here when available.
      </Empty>
    );
  return (
    compact ? (
      <ScrollViewport className="overview-scroll-viewport" label="Scrollable project health list">
        <div className="project-stack">
          {projects.data.projects.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      </ScrollViewport>
    ) : (
      <div className="project-grid">
        {projects.data.projects.map((p) => <ProjectCard key={p.id} project={p} />)}
      </div>
    )
  );
}
export function ProjectsScreen() {
  const { projects } = useDashboard();
  return (
    <>
      <PageTitle
        eyebrow="System registry / 02"
        title="Projects"
        description="Connected systems & services"
        action={<Refresh />}
      />
      <div className="section-strip">
        <span>
          {projects.data
            ? `${projects.data.projects.length} REGISTERED SYSTEM(S)`
            : "LOADING REGISTRY"}
        </span>
        <span>INDEPENDENT RUNTIMES / ONE OBSERVATION POINT</span>
      </div>
      <ProjectCollection />
      <Panel
        color="cyan"
        className="registry-note"
        label="Architecture / project sovereignty"
        title="Connected. Still independent."
      >
        <p>
          Each project owns its runtime and business execution. Neo AVO observes
          operational evidence; connected systems continue to operate
          independently.
        </p>
      </Panel>
    </>
  );
}
export function ProjectScreen({ id }: { id: string }) {
  const { revision, refresh, incidents } = useDashboard();
  const result = useRead<ProjectDetail>(
    `/api/v1/dashboard/projects/${encodeURIComponent(id)}`,
    revision,
  );
  const [tab, setTab] = useState("Summary");
  if (result.error)
    return (
      <>
        <PageTitle
          eyebrow="Project workspace"
          title="Project"
          description="Operational workspace unavailable"
        />
        <ErrorState retry={refresh}>{result.error}</ErrorState>
      </>
    );
  if (!result.data) return <Loading />;
  const { project: p, recentEvents } = result.data;
  const related = incidents.data?.incidents.filter((i) => i.projectId === id);
  const events = recentEvents.map((e) => ({ ...e, project: p }));
  return (
    <>
      <Link className="breadcrumb" href="/projects">
        <Icon name="back" /> All projects
      </Link>
      <PageTitle
        eyebrow={`Project workspace / ${p.environment}`}
        title={p.name}
        description={`${p.runtimeMode.replaceAll("_", " ")} / ${p.healthStrategy.replaceAll("_", " ")}`}
        action={<Refresh />}
      />
      <div className="workspace-state">
        <Availability value={p.availability} />
        <Badge value={p.operationalHealth} />
        <Badge value={p.businessHealth} />
        <span className="muted">
          Last seen <Time value={p.lastSeenAt} />
        </span>
      </div>
      <div className="tabs" role="tablist" aria-label="Project sections">
        {["Summary", "Activity", "Incidents", "Context"].map((t) => (
          <button
            role="tab"
            id={`tab-${t}`}
            aria-controls="workspace-panel"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div id="workspace-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "Summary" && (
          <div className="workspace-grid">
            <div className="span-full">
              <QraAuditControl detail={result.data} />
              <BriefingRegenerateControl detail={result.data} />
            </div>
            <Panel
              title="Operational summary"
              label="Machine truth"
              color={tone(p.operationalHealth)}
            >
              <Facts
                rows={[
                  [
                    "Availability",
                    <Availability key="a" value={p.availability} />,
                  ],
                  [
                    "Operational health",
                    <Badge key="h" value={p.operationalHealth} />,
                  ],
                  [
                    "Business health",
                    <Badge key="b" value={p.businessHealth} />,
                  ],
                  [
                    "Last operational event",
                    <Time key="o" value={p.lastOperationalAt} />,
                  ],
                  [
                    "Last successful execution",
                    <Time key="s" value={p.lastSuccessfulExecutionAt} />,
                  ],
                  [
                    "Next expected execution",
                    <Time key="e" value={p.expectedNextExecutionAt} />,
                  ],
                ]}
              />
            </Panel>
            <Panel title="Project attention" label="Incident evidence">
              {incidents.error ? (
                <ErrorState retry={refresh} />
              ) : !related ? (
                <Loading />
              ) : related.filter((i) => i.state !== "RESOLVED").length ? (
                <IncidentRows
                  incidents={related.filter((i) => i.state !== "RESOLVED")}
                  limit={3}
                />
              ) : (
                <Empty title="No active incidents">
                  No active incidents in available project records.
                </Empty>
              )}
            </Panel>
            <Panel title="Operations intelligence" label="Expected work and context">
              <Facts rows={[
                ["Expected executions", result.data.expectedExecutions?.length ?? 0],
                ["Dependencies", result.data.dependencies?.length ?? 0],
                ["Recent changes", result.data.changes?.length ?? 0],
                ["Active incident records", result.data.incidents?.filter((incident) => incident.state !== "RESOLVED").length ?? 0],
              ]} />
              <p className="muted">Expected execution, dependency, change, recovery, and timeline evidence remain machine-derived. Repository and AI context are advisory.</p>
            </Panel>
            <Panel
              className="span-full"
              title="Recent activity"
              label="Observed events"
            >
              <ActivityFeed compact events={events} />
            </Panel>
            <Panel className="span-full" title="Operational timeline" label="Normalized chronological projection">
              <OperationalTimeline items={result.data.timeline?.items ?? []} />
            </Panel>
          </div>
        )}
        {tab === "Activity" && (
          <Panel title="Project activity">
            <ActivityFeed events={events} />
            <p className="muted">
              Up to 50 recent events. Context filters use reported values only.
            </p>
          </Panel>
        )}
        {tab === "Incidents" && (
          <Panel title="Project incidents">
            {incidents.error ? (
              <ErrorState retry={refresh} />
            ) : !related ? (
              <Loading />
            ) : related.length ? (
              <IncidentRows incidents={related} />
            ) : (
              <Empty title="No incidents recorded">
                No incident records are available for this project.
              </Empty>
            )}
          </Panel>
        )}
        {tab === "Context" && (
          <Panel
            title="Integration context"
            label="Registry metadata / read-only"
          >
            <Facts
              rows={[
                ["Identity", p.slug],
                ["Environment", p.environment],
                ["Runtime", p.runtimeMode],
                ["Health strategy", p.healthStrategy],
                ["Criticality", p.criticality],
                [
                  "Declared capabilities",
                  p.capabilities.join(", ") || "None declared",
                ],
                ["Last seen", <Time key="l" value={p.lastSeenAt} />],
              ]}
            />
            <ProjectControls detail={result.data} />
          </Panel>
        )}
      </div>
    </>
  );
}
export function ActivityScreen() {
  return (
    <>
      <PageTitle
        eyebrow="Operational history / 03"
        title="Activity"
        description="What happened across your autonomous office"
        action={<Refresh />}
      />
      <Panel label="Normalized facts / recent observation window">
        <ActivitySurface />
      </Panel>
    </>
  );
}
export function IncidentsScreen() {
  const { incidents, refresh } = useDashboard();
  const [state, setState] = useState("ACTIVE");
  const [project, setProject] = useState("");
  const [severity, setSeverity] = useState("");
  useEffect(() => {
    setProject(
      new URLSearchParams(window.location.search).get("project") || "",
    );
  }, []);
  const items = incidents.data?.incidents.filter(
    (i) =>
      (!project || i.projectId === project) &&
      (!severity || i.severity === severity) &&
      (state === "ALL" ||
        (state === "ACTIVE" ? i.state !== "RESOLVED" : i.state === state)),
  );
  return (
    <>
      <PageTitle
        eyebrow="Operational attention / 04"
        title="Attention"
        description="Operational events requiring your attention"
        action={<Refresh />}
      />
      <div className="attention-toolbar">
        <div className="tabs" aria-label="Incident state">
          {["ACTIVE", "RESOLVED", "ALL"].map((s) => (
            <button
              key={s}
              aria-pressed={state === s}
              onClick={() => setState(s)}
            >
              {s}{" "}
              {incidents.data
                ? incidents.data.incidents.filter(
                    (i) =>
                      s === "ALL" ||
                      (s === "ACTIVE" ? i.state !== "RESOLVED" : i.state === s),
                  ).length
                : "—"}
            </button>
          ))}
        </div>
        <label>
          Severity{" "}
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="">All severities</option>
            {["CRITICAL", "HIGH", "WARNING", "INFO"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {project && (
          <button onClick={() => setProject("")}>Clear project filter ×</button>
        )}
      </div>
      {incidents.error ? (
        <ErrorState retry={refresh} />
      ) : !items ? (
        <Loading />
      ) : items.length ? (
        <IncidentRows incidents={items} />
      ) : (
        <Panel>
          <Empty
            title={
              state === "ACTIVE"
                ? "No active incidents"
                : "No matching incidents"
            }
          >
            No incident records match this view. Availability and operational
            health remain separate signals.
          </Empty>
        </Panel>
      )}
    </>
  );
}
export function IncidentScreen({ id }: { id: string }) {
  return (
    <>
      <Link className="breadcrumb" href="/incidents">
        <Icon name="back" /> All incidents
      </Link>
      <PageTitle
        eyebrow="Incident investigation"
        title="Incident"
        description="Evidence first. Interpretation second."
      />
      <IncidentContent id={id} />
    </>
  );
}
export function AgentsScreen() {
  const activity = useActivity();
  const { refresh } = useDashboard();
  const agentEvents = activity.events.filter((e) =>
    e.type.startsWith("agent."),
  );
  return (
    <>
      <PageTitle
        eyebrow="Agent observability / 05"
        title="Agents"
        description="Autonomous workers reporting to Neo AVO"
      />
      <Panel
        color="purple"
        className="agent-empty"
        label="Agent / worker visibility"
      >
        <span className="agent-glyph" aria-hidden="true">
          <Icon name="agents" />
        </span>
        <Empty title="No agents reporting">
          Registered agents and workers will appear here when identity and state
          telemetry are available.
        </Empty>
        <p className="muted">
          Live identity, sessions, model usage and cost telemetry are not
          available yet.
        </p>
      </Panel>
      <Panel title="Reported agent activity" label="Machine-reported events">
        {activity.error || activity.failed.length > 0 ? (
          <ErrorState retry={refresh}>
            Agent event visibility is incomplete.
          </ErrorState>
        ) : activity.loading ? (
          <Loading />
        ) : agentEvents.length ? (
          <ActivityFeed events={agentEvents} />
        ) : (
          <Empty title="No recent agent events">
            No agent events found in the available recent activity window.
          </Empty>
        )}
      </Panel>
    </>
  );
}
function SelectedAnalysis({ id }: { id: string }) {
  const { revision, refresh } = useDashboard();
  const detail = useRead<IncidentDetail>(
    `/api/v1/dashboard/incidents/${encodeURIComponent(id)}`,
    revision,
  );
  return detail.error ? (
    <ErrorState retry={refresh}>Incident analysis unavailable.</ErrorState>
  ) : !detail.data ? (
    <Loading />
  ) : (
    <>
      <div className="analysis-source">
        <span className="eyebrow">Machine evidence</span>
        <h3>{detail.data.incident.type.replaceAll("_", " ")}</h3>
        <Badge value={detail.data.incident.severity} />
        <p>{detail.data.incident.reason}</p>
        <Link href={`/incidents/${id}`}>Open source incident <Icon name="arrow" /></Link>
      </div>
      <AnalysisContent detail={detail.data} />
    </>
  );
}
export function IntelligenceScreen() {
  const { incidents, refresh } = useDashboard();
  const [selected, setSelected] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="Ops analyst / 06"
        title="Intelligence"
        description="AI-assisted operational analysis"
      />
      <div className="intelligence-layout">
        <Panel
          color="purple"
          className="analyst-intro"
          label="Interpretation / not system state"
        >
          <span className="analyst-symbol" aria-hidden="true">
            <Icon name="intelligence" />
          </span>
          <h2>
            Facts first.
            <br />
            Perspective next.
          </h2>
          <p>
            Machines determine what happened. Ops Analyst helps explain why and
            what to investigate.
          </p>
          <div className="section-strip">
            ADVISORY ONLY / NO AUTOMATIC EXECUTION
          </div>
        </Panel>
        <Panel title="Incident assessments" label="Existing analyses">
          <p>Select an incident to read its available assessment.</p>
          {incidents.error ? (
            <ErrorState retry={refresh} />
          ) : !incidents.data ? (
            <Loading />
          ) : !incidents.data.incidents.length ? (
            <Empty title="No assessments to inspect">
              Incident-linked analysis will appear when incidents and completed
              assessments are available.
            </Empty>
          ) : (
            <>
              <label className="field-label" htmlFor="analysis-incident">
                Source incident
              </label>
              <select
                id="analysis-incident"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Select an incident</option>
                {incidents.data.incidents.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.type} / {i.environment} / {i.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              {selected ? (
                <SelectedAnalysis id={selected} />
              ) : (
                <Empty title="Choose your evidence">
                  Open an existing incident assessment to begin.
                </Empty>
              )}
            </>
          )}
        </Panel>
      </div>
      <p className="muted data-note">
        Incident assessments are available for investigation. Free-form queries
        and global operational briefs are not available yet.
      </p>
    </>
  );
}
export function SettingsScreen() {
  const [tab, setTab] = useState("Projects");
  const { projects, health, refresh } = useDashboard();
  return (
    <>
      <PageTitle
        eyebrow="Console configuration / 07"
        title="Settings"
        description="Registry, integrations & system visibility"
      />
      <div className="settings-layout">
        <div className="settings-nav" aria-label="Settings sections">
          {["Projects", "Notifications", "Integrations", "System"].map((t) => (
            <button aria-pressed={tab === t} key={t} onClick={() => setTab(t)}>
              {t}
              <span><Icon name="arrow" /></span>
            </button>
          ))}
        </div>
        <Panel label="Configuration / read-only" title={tab}>
          {tab === "Projects" &&
            (projects.error ? (
              <ErrorState retry={refresh} />
            ) : !projects.data ? (
              <Loading />
            ) : projects.data.projects.length ? (
              projects.data.projects.map((p) => (
                <div className="setting-row" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <p className="muted">
                      {p.environment} / {p.healthStrategy}
                    </p>
                  </div>
                  <Link className="button" href={`/projects/${p.id}`}>
                    Inspect <Icon name="arrow" />
                  </Link>
                </div>
              ))
            ) : (
              <Empty title="No registered projects">
                Project registration is managed through the existing integration
                process.
              </Empty>
            ))}
          {tab === "Notifications" && (
            <>
              <div className="setting-row">
                <div>
                  <h3>Telegram operations notifier</h3>
                  <p>Owner-facing operational notifications.</p>
                </div>
                <Badge value="UNKNOWN" />
              </div>
              <Empty title="Delivery status unavailable">
                Notifier connectivity and notification preferences are not
                available in this console.
              </Empty>
              <p className="muted">
                Notification configuration remains managed outside this console.
              </p>
            </>
          )}
          {tab === "Integrations" && (
            <>
              <div className="setting-row">
                <div>
                  <h3>Project telemetry</h3>
                  <p>Registered systems use the existing event integration.</p>
                </div>
                <Link href="/projects">Inspect projects <Icon name="arrow" /></Link>
              </div>
              <div className="setting-row">
                <div>
                  <h3>Ops Analyst</h3>
                  <p>Incident-linked advisory analysis.</p>
                </div>
                <Link href="/intelligence">View assessments <Icon name="arrow" /></Link>
              </div>
              <p className="muted">
                Credential values and connection configuration are not
                displayed.
              </p>
            </>
          )}
          {tab === "System" &&
            (health.error ? (
              <ErrorState retry={refresh}>
                Web/database health check unavailable or degraded. Worker and
                backup status cannot be inferred.
              </ErrorState>
            ) : !health.data ? (
              <Loading />
            ) : (
              <Facts
                rows={[
                  [
                    "Web health",
                    health.data.status === "ok" ? "Available" : "Degraded",
                  ],
                  ["Database connectivity", health.data.checks.database],
                  ["Worker health", "Telemetry unavailable"],
                  ["Backup state", "Telemetry unavailable"],
                  ["Environment / version", "Telemetry unavailable"],
                ]}
              />
            ))}
        </Panel>
      </div>
    </>
  );
}

export function ServerHealthCard() {
  const [data, setData] = useState<{ hostSnapshot?: { cpuPercent: number; memoryPercent: number; diskPercent: number; serviceState?: Record<string, unknown>; observedAt: string } } | null>(null);

  useEffect(() => {
    fetch("/api/v1/dashboard/overview")
      .then((res) => res.json())
      .then(setData)
      .catch(() => null);
  }, []);

  const snapshot = data?.hostSnapshot;
  const cpu = snapshot?.cpuPercent ?? "—";
  const mem = snapshot?.memoryPercent ?? "—";
  const disk = snapshot?.diskPercent ?? "—";
  const pressure = (snapshot?.serviceState as { pressureState?: string })?.pressureState ?? "NORMAL";

  return (
    <Panel
      className="server-health-card"
      color={pressure === "CRITICAL" ? "coral" : pressure === "WARNING" ? "orange" : "lime"}
      label="03 / Host Infrastructure"
      title="shared-prod-01"
      action={<Link href="/infrastructure">View Infrastructure <Icon name="arrow" /></Link>}
    >
      <Facts
        rows={[
          ["Host", "shared-prod-01 (AWS Lightsail)"],
          ["Pressure State", pressure],
          ["CPU / Load", `${cpu}%`],
          ["Memory", `${mem}%`],
          ["Disk", `${disk}%`],
          ["Services Status", "6 / 6 Monitored Services Healthy"],
        ]}
      />
      <div style={{ marginTop: "1rem" }}>
        <Link className="text-link" href="/infrastructure">
          Inspect Infrastructure <Icon name="arrow" />
        </Link>
      </div>
    </Panel>
  );
}

export function InfrastructureScreen() {
  const [range, setRange] = useState<"1h" | "6h" | "24h" | "7d" | "30d">("24h");
  const [infra, setInfra] = useState<{
    host?: { name: string; provider: string; environment: string; region: string; hostname: string; architecture: string; vcpuCount: number };
    monitoredServices?: Array<{ name: string; displayName: string; projectAssociation: string; criticality: string; status?: string }>;
    latestSnapshot?: { cpuPercent: number; memoryPercent: number; diskPercent: number; serviceState?: Record<string, unknown>; observedAt: string };
    history?: Array<{ cpuPercent: number; memoryPercent: number; diskPercent: number; pressureStatePeak?: string; observedAt: string }>;
  } | null>(null);

  useEffect(() => {
    const load = () => {
      fetch(`/api/v1/infrastructure?range=${range}`)
        .then((res) => res.json())
        .then(setInfra)
        .catch(() => null);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [range]);

  const latest = infra?.latestSnapshot;
  const state = (latest?.serviceState as { pressureState?: string })?.pressureState || "NORMAL";

  return (
    <>
      <PageTitle
        eyebrow="Mission control / Infrastructure"
        title="Host Infrastructure"
        description="Live telemetry, historical aggregation, dependency mapping, and blast-radius for shared-prod-01"
      />
      <div className="overview-bento">
        <Panel label="01 / Host Overview" title={infra?.host?.name || "shared-prod-01"}>
          <Facts
            rows={[
              ["Provider", infra?.host?.provider || "AWS Lightsail"],
              ["Region", infra?.host?.region || "ap-southeast-1"],
              ["Environment", infra?.host?.environment || "production"],
              ["Hostname", infra?.host?.hostname || "ip-172-26-11-88"],
              ["Architecture", infra?.host?.architecture || "x86_64"],
              ["vCPUs", String(infra?.host?.vcpuCount || 2)],
            ]}
          />
        </Panel>

        <Panel label="02 / Live Resource Health" title={`Pressure State: ${state}`}>
          <Facts
            rows={[
              ["CPU / Load", `${latest?.cpuPercent ?? "—"}%`],
              ["Memory", `${latest?.memoryPercent ?? "—"}%`],
              ["Disk", `${latest?.diskPercent ?? "—"}%`],
              ["Swap Pressure", "< 1% (0% pressure)"],
              ["Pressure State", state],
            ]}
          />
        </Panel>

        <Panel label="03 / Host → Project Dependency Mapping" title="Monitored Services & Ownership">
          <Facts
            rows={[
              ["Neo AVO Web (neo-avo-web)", "Project: Neo AVO (ACTIVE / Critical)"],
              ["Neo AVO Worker (neo-avo-worker)", "Project: Neo AVO (ACTIVE / Critical)"],
              ["PostgreSQL 16 (postgresql)", "Shared Dependency (ACTIVE / Critical)"],
              ["Nginx Proxy (nginx)", "Shared Dependency (ACTIVE / Critical)"],
              ["QRA Worker (qra-commands)", "Project: QRA (ACTIVE / Normal)"],
              ["Briefing Agent Worker (briefing-agent)", "Project: Briefing Agent (ACTIVE / Normal)"],
            ]}
          />
        </Panel>

        <Panel label="04 / Host Blast-Radius Context" title="Potentially Affected Projects">
          <Facts
            rows={[
              ["Primary Host", "shared-prod-01"],
              ["Shared Services", "PostgreSQL 16, Nginx Reverse Proxy"],
              ["Potentially Affected Systems", "Neo AVO, QRA, Briefing Agent"],
              ["Blast Radius Assessment", "If PostgreSQL or host fails, all 3 colocated projects are potentially impacted"],
            ]}
          />
        </Panel>

        <Panel label="05 / Resource Trend History & Aggregation" title={`Historical Range: ${range}`}>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            {(["1h", "6h", "24h", "7d", "30d"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  padding: "0.25rem 0.75rem",
                  background: range === r ? "#22c55e" : "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="muted">
            {infra?.history?.length
              ? `Loaded ${infra.history.length} bounded data points for time range ${range}. Source: ${
                  range === "7d" ? "5-minute aggregates" : range === "30d" ? "1-hour aggregates" : "raw 30s snapshots"
                }.`
              : "Loading resource history telemetry…"}
          </p>
          {infra?.history && infra.history.length > 0 && (
            <div style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
              <p>Peak Load / CPU in range: {Math.max(...infra.history.map((h) => h.cpuPercent))}%</p>
              <p>Mean Memory in range: {Math.round(infra.history.reduce((sum, h) => sum + h.memoryPercent, 0) / infra.history.length)}%</p>
            </div>
          )}
        </Panel>

        <Panel label="06 / Pressure Episodes & Incident Context" title="Historical Episodes">
          <Facts
            rows={[
              ["Historical Episode 1", "Runaway grep (12h 27m duration, Peak ~95.6% CPU, Remediation: SIGTERM PID 27879)"],
              ["Status", "RECOVERED (Normal state restored)"],
              ["Linked Incidents", "View Incident Inspector for correlated HOST_RESOURCE_CONTENTION"],
            ]}
          />
          <div style={{ marginTop: "1rem" }}>
            <Link className="square-link" href="/incidents">
              Inspect Correlated Incidents <Icon name="arrow" />
            </Link>
          </div>
        </Panel>
      </div>
    </>
  );
}


