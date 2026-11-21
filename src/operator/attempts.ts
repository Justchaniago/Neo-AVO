import type { NextRequest } from "next/server";

export const MAX_FAILED_ATTEMPTS = 10;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 10_000;

const store = globalThis as typeof globalThis & { __neoAvoFailedSignIns?: Map<string, number[]> };
const failures = () => (store.__neoAvoFailedSignIns ??= new Map());

/** The reverse proxy sets X-Real-IP; without one every caller shares a single budget. */
export function clientKey(request: NextRequest) {
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function recent(client: string, now: number) {
  const kept = (failures().get(client) ?? []).filter((at: number) => now - at < ATTEMPT_WINDOW_MS);
  if (kept.length) failures().set(client, kept);
  else failures().delete(client);
  return kept;
}

/** Seconds until the client may try again, or 0 when it is not limited. */
export function retryAfterSeconds(client: string, now = Date.now()) {
  const kept = recent(client, now);
  return kept.length < MAX_FAILED_ATTEMPTS ? 0 : Math.max(1, Math.ceil((kept[0] + ATTEMPT_WINDOW_MS - now) / 1000));
}

/**
 * Counts an attempt before it is checked, so a burst cannot outrun the limit.
 * Returns the seconds to wait when the client is limited, otherwise a function that forgets the attempt once it succeeded.
 */
export function beginAttempt(client: string, now = Date.now()): number | (() => void) {
  const retryAfter = retryAfterSeconds(client, now);
  if (retryAfter) return retryAfter;
  recordFailedAttempt(client, now);
  return () => {
    const kept = failures().get(client);
    const index = kept?.indexOf(now) ?? -1;
    if (index >= 0) kept!.splice(index, 1);
    if (kept && !kept.length) failures().delete(client);
  };
}

export function recordFailedAttempt(client: string, now = Date.now()) {
  const map = failures();
  if (!map.has(client) && map.size >= MAX_TRACKED_CLIENTS) {
    for (const key of [...map.keys()]) recent(key, now);
    if (map.size >= MAX_TRACKED_CLIENTS) map.delete(map.keys().next().value!);
  }
  map.set(client, [...recent(client, now), now]);
}

export function clearFailedAttempts(client?: string) {
  if (client === undefined) failures().clear();
  else failures().delete(client);
}
