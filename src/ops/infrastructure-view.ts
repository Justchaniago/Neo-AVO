/** Pure read-model helpers for the Infrastructure screens. No I/O; safe to import from client components. */

export interface ServiceDefinition {
  name: string;
  displayName: string;
  projectAssociation: string;
  criticality: string;
}

export interface ServiceRow extends ServiceDefinition {
  status: string;
  shared: boolean;
}

export interface HistoryPoint {
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  pressureStatePeak?: string;
  observedAt: string;
}

export interface PressureEpisode {
  startedAt: string;
  endedAt: string;
  ongoing: boolean;
  peakState: "WARNING" | "CRITICAL";
  peakCpuPercent: number;
  peakMemoryPercent: number;
}

const SHARED_ASSOCIATION = "platform";

/** Joins the configured services with the statuses reported in the latest host snapshot. */
export function serviceRows(definitions: ServiceDefinition[] | undefined, serviceState: unknown): ServiceRow[] {
  const reported = (serviceState as { services?: unknown } | null | undefined)?.services;
  const statusByName = new Map<string, string>();
  if (Array.isArray(reported)) {
    for (const entry of reported) {
      const item = entry as { name?: unknown; status?: unknown };
      if (typeof item?.name === "string" && typeof item.status === "string") statusByName.set(item.name, item.status);
    }
  }
  return (definitions ?? []).map((definition) => ({
    ...definition,
    status: statusByName.get(definition.name) ?? "UNKNOWN",
    shared: definition.projectAssociation === SHARED_ASSOCIATION,
  }));
}

export function serviceSummary(rows: ServiceRow[]): string {
  if (!rows.length) return "No monitored services configured";
  if (rows.every((row) => row.status === "UNKNOWN")) return `${rows.length} monitored · status not reported`;
  const active = rows.filter((row) => row.status === "ACTIVE").length;
  return `${active} / ${rows.length} monitored services active`;
}

export function blastRadius(rows: ServiceRow[]) {
  const sharedServices = rows.filter((row) => row.shared).map((row) => row.displayName);
  const projects = [...new Set(rows.filter((row) => !row.shared).map((row) => row.projectAssociation))];
  return { sharedServices, projects };
}

/** Load averages from a snapshot's serviceState, or null when the snapshot has none. */
export function loadAverages(serviceState: unknown): [number, number, number] | null {
  const state = serviceState as { load1?: unknown; load5?: unknown; load15?: unknown } | null | undefined;
  const values = [state?.load1, state?.load5, state?.load15];
  return values.every((value) => typeof value === "number" && Number.isFinite(value)) ? (values as [number, number, number]) : null;
}

/** Groups consecutive non-NORMAL history points (oldest first) into pressure episodes, newest first. */
export function pressureEpisodes(history: HistoryPoint[] | undefined): PressureEpisode[] {
  const episodes: PressureEpisode[] = [];
  let current: PressureEpisode | null = null;
  for (const point of history ?? []) {
    const peak = point.pressureStatePeak;
    if (peak === "WARNING" || peak === "CRITICAL") {
      if (!current) {
        current = { startedAt: point.observedAt, endedAt: point.observedAt, ongoing: true, peakState: peak, peakCpuPercent: point.cpuPercent, peakMemoryPercent: point.memoryPercent };
      } else {
        current.endedAt = point.observedAt;
        if (peak === "CRITICAL") current.peakState = "CRITICAL";
        current.peakCpuPercent = Math.max(current.peakCpuPercent, point.cpuPercent);
        current.peakMemoryPercent = Math.max(current.peakMemoryPercent, point.memoryPercent);
      }
    } else if (current) {
      current.ongoing = false;
      current.endedAt = point.observedAt;
      episodes.push(current);
      current = null;
    }
  }
  if (current) episodes.push(current);
  return episodes.reverse();
}

export function formatDuration(startedAt: string, endedAt: string): string {
  const minutes = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  if (minutes < 1) return "under 1m";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", rest ? `${rest}m` : ""].filter(Boolean).join(" ");
}
