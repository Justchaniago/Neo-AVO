"use client";

import { useEffect, useState } from "react";

type Incident = { id: string; projectId: string; environment: string; type: string; severity: string; state: string; reason: string; firstSeenAt: string; lastSeenAt: string; occurrenceCount: number };

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  useEffect(() => { fetch("/api/v1/dashboard/incidents").then((response) => response.json()).then((data) => setIncidents(data.incidents)); }, []);
  return <main><p className="eyebrow"><a href="/">← Overview</a></p><h1>Incidents</h1><p className="muted">Deterministic operational signals requiring attention.</p>{!incidents ? <p className="muted">Loading incidents…</p> : incidents.length === 0 ? <p className="muted">No incidents recorded.</p> : <section className="grid">{incidents.map((incident) => <article className="card" key={incident.id}><p className={`state ${incident.severity.toLowerCase()}`}>{incident.severity} · {incident.state}</p><h2><a href={`/incidents/${incident.id}`}>{incident.type}</a></h2><p>{incident.reason}</p><p className="muted">{incident.environment} · {incident.occurrenceCount} occurrence(s)</p><p className="muted">Last seen: {new Date(incident.lastSeenAt).toLocaleString()}</p></article>)}</section>}</main>;
}
