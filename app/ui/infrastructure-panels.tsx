"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";
import { Badge, Time, percent } from "./primitives";
import {
  blastRadius,
  formatDuration,
  type PressureEpisode,
  type ServiceRow,
} from "../../src/ops/infrastructure-view";

type Row = [string, ReactNode];

export function serviceFactRows(rows: ServiceRow[]): Row[] {
  if (!rows.length) return [["Services", "No monitored services reported"]];
  return rows.map((row) => [
    `${row.displayName} (${row.name})`,
    <span key={row.name} className="service-fact">
      <Badge value={row.status} />
      <span>{row.shared ? "Shared dependency" : `Project: ${row.projectAssociation}`} · {row.criticality.toLowerCase()}</span>
    </span>,
  ]);
}

export function blastRadiusFactRows(hostName: string, rows: ServiceRow[]): Row[] {
  const { sharedServices, projects } = blastRadius(rows);
  return [
    ["Primary Host", hostName],
    ["Shared Services", sharedServices.join(", ") || "None reported"],
    ["Colocated Projects", projects.join(", ") || "None reported"],
    [
      "Blast Radius Assessment",
      projects.length
        ? `A host${sharedServices.length ? " or shared-service" : ""} failure can affect ${projects.length === 1 ? "1 colocated project" : `all ${projects.length} colocated projects`}.`
        : "Not enough service data to assess.",
    ],
  ];
}

export function episodeFactRows(episodes: PressureEpisode[] | undefined, range: string, loaded: boolean): Row[] {
  episodes = episodes ?? [];
  const rows: Row[] = episodes.slice(0, 5).map((episode, index) => [
    `Episode ${index + 1}`,
    <span key={episode.startedAt} className="service-fact">
      <Badge value={episode.peakState} />
      <span>
        <Time value={episode.startedAt} /> · {episode.ongoing ? "ongoing" : formatDuration(episode.startedAt, episode.endedAt)} · peak load {percent(episode.peakCpuPercent)}, memory {percent(episode.peakMemoryPercent)}
      </span>
    </span>,
  ]);
  if (!rows.length) {
    rows.push(["Episodes", loaded ? `No pressure episodes recorded in the last ${range}.` : "Loading…"]);
  } else if (episodes.length > rows.length) {
    rows.push(["Older", `${episodes.length - rows.length} more in this range`]);
  }
  rows.push([
    "Incidents",
    <Link key="incidents" className="button button-small incident-cta-btn" href="/incidents">
      Open incidents <Icon name="arrow" />
    </Link>,
  ]);
  return rows;
}
