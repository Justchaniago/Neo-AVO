"use client";

import { useEffect, useState } from "react";

type Project = { id: string; slug: string; name: string; environment: string; availability: string; operationalHealth: string; lastOperationalAt: string | null; runtimeMode: string; healthStrategy: string };

export function DashboardOverview() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/v1/dashboard/overview").then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load dashboard"))).then((data) => setProjects(data.projects)).catch((reason: Error) => setError(reason.message)); }, []);
  return (
    <main>
      <p className="eyebrow">Neo AVO / Overview</p>
      <h1>Operations overview</h1>
      <p className="muted">Observe-first health and activity across registered projects.</p>
      {error && <p>{error}</p>}
      {!projects && !error && <p className="muted">Loading projects…</p>}
      {projects && <section className="grid">{projects.map((project) => <article className="card" key={project.id}><p className="eyebrow">{project.environment}</p><h2><a href={`/projects/${project.id}`}>{project.name}</a></h2><p className="muted">{project.slug} · {project.runtimeMode} · {project.healthStrategy}</p><p className={`state ${project.availability.toLowerCase()}`}>Availability: {project.availability}</p><p className={`state ${project.operationalHealth.toLowerCase()}`}>Health: {project.operationalHealth}</p><p className="muted">Last activity: {project.lastOperationalAt ? new Date(project.lastOperationalAt).toLocaleString() : "No evidence"}</p></article>)}</section>}
      <p><a href="/incidents">View incidents</a></p>
    </main>
  );
}
