"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { Incident, Project, ProjectDetail, ScopedActivity } from "./model";
import { read, invalidateReads, receivedAt } from "./read-client";
export { read } from "./read-client";

export function useRead<T>(url: string | null, revision = 0) {
  const [state, setState] = useState<{
    url: string | null;
    data?: T;
    error?: string;
    loading: boolean;
    updatedAt?: string;
  }>({ url, loading: !!url });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!url) return;
    setState((previous) => ({
      url,
      data: previous.url === url ? previous.data : undefined,
      updatedAt: previous.url === url ? previous.updatedAt : undefined,
      error: previous.url === url ? previous.error : undefined,
      loading: true,
    }));
    read<T>(url, controller.signal)
      .then((data) => {
        if (active) setState({ url, data, loading: false, updatedAt: new Date(receivedAt(url) || Date.now()).toISOString() });
      })
      .catch(() => {
        if (active)
          setState(previous => ({
            ...previous,
            url,
            error: "Unable to load this view. Check connectivity and retry.",
            loading: false,
          }));
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [url, revision]);
  return state.url === url
    ? state
    : { loading: true, data: undefined, error: undefined, updatedAt: undefined };
}
function useDashboardData() {
  const [revision, setRevision] = useState(0);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(0);
  const lastRequest = useRef(0);
  const refresh = useCallback(() => {
    if (!navigator.onLine || Date.now() - lastRequest.current < 1_000) return;
    lastRequest.current = Date.now();
    invalidateReads();
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    setNow(Date.now());
    setOnline(navigator.onLine);
    const resume = () => {
      setOnline(navigator.onLine);
      setNow(Date.now());
      if (document.visibilityState === "visible" && navigator.onLine) refresh();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    const clock = setInterval(() => { if (document.visibilityState === "visible") setNow(Date.now()); }, 15_000);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", resume);
      for (const event of ["focus", "online", "offline"]) window.removeEventListener(event, resume);
    };
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
  const stamps = [projects.updatedAt, incidents.updatedAt, health.updatedAt];
  const checkedAt = stamps.every(Boolean) ? stamps.reduce((oldest, stamp) => stamp! < oldest! ? stamp : oldest)! : null;
  const refreshing = projects.loading || incidents.loading || health.loading;
  const stale = !online || !!projects.error || !!incidents.error || !!health.error || (!!checkedAt && now - Date.parse(checkedAt) > 90_000);
  return { projects, incidents, health, revision, refresh, checkedAt, online, now, refreshing, stale };
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
export async function readProjectActivity(projects: Project[], signal?: AbortSignal) {
  const events: ScopedActivity[] = [];
  const failed: string[] = [];
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, projects.length) }, async () => {
      while (index < projects.length && !signal?.aborted) {
        const project = projects[index++];
        try {
          const detail = await read<ProjectDetail>(
            `/api/v1/dashboard/projects/${project.id}`,
            signal,
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
    loaded: boolean;
  }>({ events: [], failed: [], loading: true, loaded: false });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!enabled || !projects.data) return;
    setResult((previous) => ({ ...previous, loading: true }));
    readProjectActivity(projects.data.projects, controller.signal).then((data) => {
      if (active) setResult(previous => ({ ...data, events: [...data.events, ...previous.events.filter(event => data.failed.includes(event.project.name))], loading: false, loaded: true }));
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, projects.data, revision]);
  return { ...result, error: projects.error };
}
