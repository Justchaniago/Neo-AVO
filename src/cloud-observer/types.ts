export type CloudProvider = "AWS" | "GCP";
export type Capability = "infrastructure" | "cost" | "credits";
export type CapabilityStatus = "AVAILABLE" | "UNAVAILABLE" | "UNAUTHORIZED" | "STALE" | "ERROR";
export type FinancialStatus = "ACTUAL" | "ESTIMATED" | "DELAYED" | "UNKNOWN";

export type CloudResourceSnapshot = {
  provider: CloudProvider; accountId: string; resourceId: string; resourceType: string;
  region: string | null; status: string; cpuUtilization: number | null;
  memoryUtilization: number | null; diskUtilization: number | null;
  networkInBytes: number | null; networkOutBytes: number | null; observedAt: Date;
  providerDataAsOf: Date | null; freshness: CapabilityStatus;
  metadata: Record<string, string | number | boolean>;
};

export type CloudCostSnapshot = {
  provider: CloudProvider; accountId: string; currency: string | null;
  monthToDateGrossCost: number | null; creditsApplied: number | null;
  monthToDateNetCost: number | null; dailyBurnRate: number | null;
  projectedMonthEnd: number | null;
  valueStatus: Record<string, FinancialStatus>; observedAt: Date;
  providerDataAsOf: Date | null; freshness: CapabilityStatus;
};

export type CloudCreditSnapshot = {
  provider: CloudProvider; accountId: string; creditType: string; currency: string | null;
  originalAmount: number | null; remainingAmount: number | null;
  estimatedRemainingAmount: number | null; expiration: Date | null;
  valueStatus: FinancialStatus; observedAt: Date; providerDataAsOf: Date | null;
  freshness: CapabilityStatus;
};

export type CapabilityResult = {
  status: CapabilityStatus; providerDataAsOf?: Date | null; error?: string;
  resources?: CloudResourceSnapshot[]; cost?: CloudCostSnapshot; credits?: CloudCreditSnapshot[];
};

export type CloudProviderAdapter = {
  provider: CloudProvider;
  collect(capability: Capability, observedAt: Date): Promise<CapabilityResult>;
};
