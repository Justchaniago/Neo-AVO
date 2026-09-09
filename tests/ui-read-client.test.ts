import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateReads, read, receivedAt } from "../app/ui/read-client";

afterEach(() => { invalidateReads(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("operational read lifecycle", () => {
  it("deduplicates concurrent reads and preserves actual receive time on cache hits", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ value: 1 }) });
    vi.stubGlobal("fetch", fetcher);
    await Promise.all([read("/dedup"), read("/dedup")]);
    const at = receivedAt("/dedup");
    expect(at).toBeGreaterThan(0);
    await read("/dedup");
    expect(receivedAt("/dedup")).toBe(at);
    expect(fetcher).toHaveBeenCalledTimes(1);
    invalidateReads(); await read("/dedup");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not cancel another subscriber when one view unmounts", async () => {
    let complete!: (response: unknown) => void;
    let sharedSignal!: AbortSignal;
    vi.stubGlobal("fetch", vi.fn((_url, options) => { sharedSignal = options.signal; return new Promise(resolve => { complete = resolve; }); }));
    const controller = new AbortController();
    const first = read("/shared", controller.signal);
    const second = read("/shared");
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(sharedSignal.aborted).toBe(false);
    complete({ ok: true, json: async () => ({ value: 2 }) });
    await expect(second).resolves.toEqual({ value: 2 });
  });
  it("cancels abandoned requests and allows safe retry", async () => {
    vi.useFakeTimers();
    let sharedSignal!: AbortSignal;
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      sharedSignal = options.signal;
      sharedSignal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
    })));
    const controller = new AbortController();
    const pending = read("/abandoned", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1);
    expect(sharedSignal.aborted).toBe(true);
    expect(receivedAt("/abandoned")).toBe(0);
  });
  it("does not cache failed responses or invent successful freshness", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetcher);
    await expect(read("/failure")).rejects.toThrow("unavailable");
    expect(receivedAt("/failure")).toBe(0);
    await expect(read("/failure")).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
