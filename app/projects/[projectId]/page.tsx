"use client";

import { useEffect, useState } from "react";

type Detail = { project: { name: string; slug: string; environment: string; runtimeMode: string; healthStrategy: string; availability: string; operationalHealth: string; capabilities: string[]; lastSeenAt: string | null; lastSuccessfulExecutionAt: string | null }; tasks: { id: string; externalTaskId: string; status: string; currentAttempt: number; lastEventAt: string }[]; recentEvents: { id: string; eventId: string; type: string; occurredAt: string }[] };

export default function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  useEffect(() => { params.then(({ projectId }) => fetch(`/api/v1/dashboard/projects/${projectId}`).then((response) => response.json()).then(setDetail)); }, [params]);
  if (!detail) return <main><p className="muted">Loading project…</p></main>;
  const { project } = detail;
  return <main><p className="eyebrow"><a href="/">← Overview</a></p><h1>{project.name}</h1><p className="muted">{project.slug} · {project.environment}</p><section className="grid"><article className="card"><p className="eyebrow">Availability</p><p className={`state ${project.availability.toLowerCase()}`}>{project.availability}</p><p className="eyebrow">Operational health</p><p className={`state ${project.operationalHealth.toLowerCase()}`}>{project.operationalHealth}</p></article><article className="card"><p>Runtime: {project.runtimeMode}</p><p>Strategy: {project.healthStrategy}</p><p>Last seen: {project.lastSeenAt ? new Date(project.lastSeenAt).toLocaleString() : "No evidence"}</p><p>Last success: {project.lastSuccessfulExecutionAt ? new Date(project.lastSuccessfulExecutionAt).toLocaleString() : "No evidence"}</p><p>Capabilities: {project.capabilities.join(", ") || "None declared"}</p></article></section><h2>Current tasks</h2><table><thead><tr><th>Task</th><th>Status</th><th>Attempt</th><th>Last event</th></tr></thead><tbody>{detail.tasks.map((task) => <tr key={task.id}><td>{task.externalTaskId}</td><td>{task.status}</td><td>{task.currentAttempt}</td><td>{new Date(task.lastEventAt).toLocaleString()}</td></tr>)}</tbody></table><h2>Recent events</h2><table><thead><tr><th>Type</th><th>Event ID</th><th>Occurred</th></tr></thead><tbody>{detail.recentEvents.map((event) => <tr key={event.id}><td>{event.type}</td><td>{event.eventId}</td><td>{new Date(event.occurredAt).toLocaleString()}</td></tr>)}</tbody></table></main>;
}
