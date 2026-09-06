import { z } from "zod";

export const recommendedActionSchema = z.object({
  capability: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(1000),
}).strict();

export const opsAnalysisSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  likelyCause: z.string().trim().min(1).max(4000),
  confidence: z.number().min(0).max(1),
  impact: z.string().trim().min(1).max(4000),
  recommendedActions: z.array(recommendedActionSchema).max(10),
}).strict();

export type OpsAnalysis = z.infer<typeof opsAnalysisSchema>;

export const analysisStatuses = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED"] as const;
