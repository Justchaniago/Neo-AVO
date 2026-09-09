type Entry = { at: number; pending: boolean; users: number; controller: AbortController; result: Promise<unknown> };
const reads = new Map<string, Entry>();
export function receivedAt(url: string) { return reads.get(url)?.at || 0; }
export function invalidateReads() {
  for (const [url, entry] of reads) if (!entry.pending) reads.delete(url);
}
// Only GET responses live in memory. No operational data is persisted to storage.
export function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  let entry = reads.get(url);
  if (!entry || (!entry.pending && Date.now() - entry.at >= 15_000)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    entry = { at: 0, pending: true, users: 0, controller, result: Promise.resolve() };
    const current = entry;
    current.result = fetch(url, { cache: "no-store", signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Operational data unavailable");
        return response.json();
      }).then(data => { current.at = Date.now(); return data; })
      .catch(error => { if (reads.get(url) === current) reads.delete(url); throw error; })
      .finally(() => { current.pending = false; clearTimeout(timer); });
    reads.set(url, current);
  }
  const current = entry;
  current.users++;
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      signal?.removeEventListener("abort", abort);
      current.users--;
      if (!current.users && current.pending) {
        // Give React effect replacement a chance to reuse the same request.
        setTimeout(() => {
          if (!current.users && current.pending) {
            if (reads.get(url) === current) reads.delete(url);
            current.controller.abort();
          }
        }, 0);
      }
      return true;
    };
    const abort = () => { if (finish()) reject(new DOMException("Cancelled", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    current.result.then(data => { if (finish()) resolve(data as T); }, error => { if (finish()) reject(error); });
    if (signal?.aborted) abort();
  });
}
