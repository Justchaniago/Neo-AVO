import type { CloudCostSnapshot, FinancialStatus } from "./types";

export function deriveMonthEndProjection(input: {
  monthToDateGrossCost: number | null;
  creditsApplied: number | null;
  monthToDateNetCost: number | null;
  recentDailyCosts?: number[];
  sourceStatus?: "ACTUAL" | "DELAYED";
  now: Date;
}): Pick<CloudCostSnapshot, "dailyBurnRate" | "projectedMonthEnd" | "valueStatus"> {
  const day = input.now.getUTCDate();
  const days = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth() + 1, 0)).getUTCDate();
  const gross = input.monthToDateGrossCost;
  const net = input.monthToDateNetCost;
  const recent = input.recentDailyCosts?.filter(Number.isFinite) ?? [];
  const dailyBurnRate = recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : gross === null || day < 1 ? null : gross / day;
  const projectedMonthEnd = dailyBurnRate === null ? null : dailyBurnRate * days;
  const valueStatus: Record<string, FinancialStatus> = {
    gross: gross === null ? "UNKNOWN" : input.sourceStatus ?? "ACTUAL",
    creditsApplied: input.creditsApplied === null ? "UNKNOWN" : input.sourceStatus ?? "ACTUAL",
    net: net === null ? "UNKNOWN" : input.sourceStatus ?? "ACTUAL",
    dailyBurnRate: dailyBurnRate === null ? "UNKNOWN" : "ESTIMATED",
    projectedMonthEnd: projectedMonthEnd === null ? "UNKNOWN" : "ESTIMATED",
  };
  return { dailyBurnRate, projectedMonthEnd, valueStatus };
}
