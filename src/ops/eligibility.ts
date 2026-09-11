export function isAnalysisEligible(severity: string, type: string) {
  if (severity === "MEDIUM" && type === "HOST_RESOURCE_CONTENTION") return true;
  return severity === "HIGH" || severity === "CRITICAL";
}

