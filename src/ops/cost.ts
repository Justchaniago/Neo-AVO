export type CostSignal = { provider: "gcp" | "aws" | "vertex"; status: "AVAILABLE" | "NOT_CONFIGURED" | "UNAVAILABLE"; currency?: string; amount?: number; observedAt: Date; detail?: string };
export interface CostProvider { getSignals(): Promise<CostSignal[]>; }

/** Billing remains intentionally optional; callers must distinguish missing data from zero cost. */
export class NotConfiguredCostProvider implements CostProvider {
  constructor(private readonly provider: "gcp" | "aws") {}
  async getSignals(): Promise<CostSignal[]> { return [{ provider: this.provider, status: "NOT_CONFIGURED", observedAt: new Date(), detail: "No verified lightweight billing source configured" }]; }
}
