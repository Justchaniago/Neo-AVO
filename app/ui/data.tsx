"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Incident, Project, ProjectDetail, ScopedActivity } from "./model";

// Short-lived, in-memory GET cache. No credentials or operational payloads in browser storage.
const reads = new Map<string, { at: number; result: Promise<unknown> }>();
export async function read<T>(url: string): Promise<T> {
  const cached = reads.get(url);
  if (cached && Date.now() - cached.at < 15_000)
    return cached.result as Promise<T>;
  const result = fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  }).then(async (response) => {
    if (!response.ok)
      throw new Error(
        response.status === 404
          ? "This record was not found."
          : "The operational data could not be loaded.",
      );
    return response.json() as Promise<T>;
  });
  reads.set(url, { at: Date.now(), result });
  try {
    return await result;
  } catch (error) {
    reads.delete(url);
    throw error;
  }
}
export function useRead<T>(url: string | null, revision = 0) {
  const [state, setState] = useState<{
    url: string | null;
    data?: T;
    error?: string;
    loading: boolean;
  }>({ url, loading: !!url });
  useEffect(() => {
    let active = true;
    if (!url) return;
    setState((previous) => ({
      url,
      data: previous.url === url ? previous.data : undefined,
      loading: true,
    }));
    read<T>(url)
      .then((data) => {
        if (active) setState({ url, data, loading: false });
      })
      .catch(() => {
        if (active)
          setState({
            url,
            error: "Unable to load this view. Check connectivity and retry.",
            loading: false,
          });
      });
    return () => {
      active = false;
    };
  }, [url, revision]);
  return state.url === url
    ? state
    : { loading: true, data: undefined, error: undefined };
}
function useDashboardData() {
  const [revision, setRevision] = useState(0);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const refresh = useCallback(() => {
    reads.clear();
    setRevision((value) => value + 1);
    setCheckedAt(new Date().toISOString());
  }, []);
  useEffect(() => {
    setCheckedAt(new Date().toISOString());
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);
  const projects = useRead<{ projects: Project[] }>(
    "/api/v1/dashboard/overview",
    revision,
  );
  const incidents = useRead<{ incidents: Incident[] }>(
    "/api/v1/dashboard/incidents",
    revision,
  );
  const health = useRead<{ status: string; checks: { database: string } }>(
    "/api/health",
    revision,
  );
  return { projects, incidents, health, revision, refresh, checkedAt };
}
const DashboardContext = createContext<ReturnType<
  typeof useDashboardData
> | null>(null);
export function DashboardProvider({ children }: { children: ReactNode }) {
  return (
    <DashboardContext.Provider value={useDashboardData()}>
      {children}
    </DashboardContext.Provider>
  );
}
export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("Dashboard provider required");
  return value;
}

/** Bounded concurrency using existing project read APIs; no new aggregate/backend contract. */
export async function readProjectActivity(projects: Project[]) {
  const events: ScopedActivity[] = [];
  const failed: string[] = [];
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, projects.length) }, async () => {
      while (index < projects.length) {
        const project = projects[index++];
        try {
          const detail = await read<ProjectDetail>(
            `/api/v1/dashboard/projects/${project.id}`,
          );
          events.push(
            ...detail.recentEvents.map((event) => ({ ...event, project })),
          );
        } catch {
          failed.push(project.name);
        }
      }
    }),
  );
  return {
    events: events.sort(
      (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
    ),
    failed,
  };
}
export function useActivity(enabled = true) {
  const { projects, revision } = useDashboard();
  const [result, setResult] = useState<{
    events: ScopedActivity[];
    failed: string[];
    loading: boolean;
  }>({ events: [], failed: [], loading: true });
  useEffect(() => {
    let active = true;
    if (!enabled || !projects.data) return;
    setResult((previous) => ({ ...previous, loading: true }));
    readProjectActivity(projects.data.projects).then((data) => {
      if (active) setResult({ ...data, loading: false });
    });
    return () => {
      active = false;
    };
  }, [enabled, projects.data, revision]);
  return { ...result, error: projects.error };
}
