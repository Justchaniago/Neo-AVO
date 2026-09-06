export function isAnalysisEligible(severity: string, type: string) {
  return severity === "HIGH" || severity === "CRITICAL";
}
