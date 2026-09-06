"use client";

import { useEffect, useState } from "react";

type Detail = { incident: { id: string; projectId: string; environment: string; type: string; severity: string; state: string; reason: string; firstSeenAt: string; lastSeenAt: string; occurrenceCount: number; resolutionReason: string | null }; evidence: { id: string; eventId: string; linkedAt: string }[] };

export default function IncidentDetailPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  useEffect(() => { params.then(({ incidentId }) => fetch(`/api/v1/dashboard/incidents/${incidentId}`).then((response) => response.json()).then(setDetail)); }, [params]);
  if (!detail) return <main><p className="muted">Loading incident…</p></main>;
  const { incident } = detail;
  async function acknowledge() { await fetch(`/api/v1/dashboard/incidents/${incident.id}/ack`, { method: "POST" }); setDetail((current) => current ? { ...current, incident: { ...current.incident, state: "ACKNOWLEDGED" as const } } : current); }
  return <main><p className="eyebrow"><a href="/incidents">← Incidents</a></p><h1>{incident.type}</h1><p className={`state ${incident.severity.toLowerCase()}`}>{incident.severity} · {incident.state}</p><section className="card"><p>{incident.reason}</p><p className="muted">Project: {incident.projectId} · {incident.environment}</p><p className="muted">First seen: {new Date(incident.firstSeenAt).toLocaleString()}</p><p className="muted">Last seen: {new Date(incident.lastSeenAt).toLocaleString()}</p><p className="muted">Occurrences: {incident.occurrenceCount}</p>{incident.state === "OPEN" && <button onClick={acknowledge}>Acknowledge</button>}{incident.resolutionReason && <p>Resolution: {incident.resolutionReason}</p>}</section><h2>Evidence</h2><ul>{detail.evidence.map((item) => <li key={item.id}>{item.eventId} · {new Date(item.linkedAt).toLocaleString()}</li>)}</ul></main>;
}
