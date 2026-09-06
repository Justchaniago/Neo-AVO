import { z } from "zod";

export const runtimeModes = ["always_on", "on_demand", "scheduled", "hybrid"] as const;
export const healthStrategies = ["heartbeat", "execution_based", "synthetic", "external"] as const;

export const projectConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(1).max(80),
  name: z.string().trim().min(1).max(160),
  environment: z.string().regex(/^[a-zA-Z0-9._-]+$/).min(1).max(64),
  runtimeMode: z.enum(runtimeModes),
  healthStrategy: z.enum(healthStrategies),
  capabilities: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
});

// Project identity and credential scope are immutable in V1.
export const projectUpdateSchema = projectConfigSchema.omit({ slug: true, environment: true }).partial();

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;
