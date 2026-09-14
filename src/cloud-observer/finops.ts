import type { CloudCostSnapshot, FinancialStatus } from "./types";

export function deriveMonthEndProjection(input: {
  monthToDateGrossCost: number | null;
  creditsApplied: number | null;
  monthToDateNetCost: number | null;
  now: Date;
}): Pick<CloudCostSnapshot, "dailyBurnRate" | "projectedMonthEnd" | "valueStatus"> {
  const day = input.now.getUTCDate();
  const days = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth() + 1, 0)).getUTCDate();
  const gross = input.monthToDateGrossCost;
  const net = input.monthToDateNetCost;
  const dailyBurnRate = gross === null || day < 1 ? null : gross / day;
  const projectedMonthEnd = dailyBurnRate === null ? null : dailyBurnRate * days;
  const valueStatus: Record<string, FinancialStatus> = {
    gross: gross === null ? "UNKNOWN" : "ACTUAL",
    creditsApplied: input.creditsApplied === null ? "UNKNOWN" : "ACTUAL",
    net: net === null ? "UNKNOWN" : "ACTUAL",
    dailyBurnRate: dailyBurnRate === null ? "UNKNOWN" : "ESTIMATED",
    projectedMonthEnd: projectedMonthEnd === null ? "UNKNOWN" : "ESTIMATED",
  };
  return { dailyBurnRate, projectedMonthEnd, valueStatus };
}
