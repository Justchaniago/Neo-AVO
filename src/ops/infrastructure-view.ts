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

export interface PressurePoint {
  observedAt: string;
  pressureState: string;
  cpuPercent: number;
  memoryPercent: number;
}

/**
 * Groups pressured readings (WARNING/CRITICAL only, any order) into episodes, newest first.
 * Readings closer than 2.5 sampling intervals belong to the same episode. `intervalMs` is also the
 * span one reading covers, so aggregate buckets extend the episode to the end of their bucket.
 * An episode is ongoing only while the live state is still pressured and its last reading is current.
 */
export function pressureEpisodes(
  points: PressurePoint[],
  options: { intervalMs: number; bucketed: boolean; currentlyPressured: boolean; now: number },
): PressureEpisode[] {
  const sorted = points
    .filter((point) => point.pressureState === "WARNING" || point.pressureState === "CRITICAL")
    .map((point) => ({ ...point, at: new Date(point.observedAt).getTime() }))
    .sort((a, b) => a.at - b.at);
  const maxGap = options.intervalMs * 2.5;
  const span = options.bucketed ? options.intervalMs : 0;
  const episodes: Array<PressureEpisode & { lastAt: number }> = [];
  for (const point of sorted) {
    const current = episodes[episodes.length - 1];
    if (current && point.at - current.lastAt <= maxGap) {
      current.lastAt = point.at;
      if (point.pressureState === "CRITICAL") current.peakState = "CRITICAL";
      current.peakCpuPercent = Math.max(current.peakCpuPercent, point.cpuPercent);
      current.peakMemoryPercent = Math.max(current.peakMemoryPercent, point.memoryPercent);
    } else {
      episodes.push({
        startedAt: point.observedAt,
        endedAt: point.observedAt,
        ongoing: false,
        peakState: point.pressureState as "WARNING" | "CRITICAL",
        peakCpuPercent: point.cpuPercent,
        peakMemoryPercent: point.memoryPercent,
        lastAt: point.at,
      });
    }
  }
  return episodes
    .map(({ lastAt, ...episode }, index) => {
      const endMs = Math.min(lastAt + span, options.now);
      const isLatest = index === episodes.length - 1;
      return {
        ...episode,
        endedAt: new Date(endMs).toISOString(),
        ongoing: isLatest && options.currentlyPressured && options.now - lastAt <= span + maxGap,
      };
    })
    .reverse();
}

export function formatDuration(startedAt: string, endedAt: string): string {
  const minutes = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  if (minutes < 1) return "under 1m";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", rest ? `${rest}m` : ""].filter(Boolean).join(" ");
}
