import { z } from "zod";

export const commandStatuses = ["REQUESTED", "SENT", "ACKNOWLEDGED", "COMPLETED", "FAILED", "REJECTED", "EXPIRED"] as const;
export const commandDeliveryModes = ["PUSH", "PULL"] as const;
export const commandArguments = {
  "task.retry": z.object({ taskId: z.string().trim().min(1).max(200) }).strict(),
  "task.cancel": z.object({ taskId: z.string().trim().min(1).max(200) }).strict(),
  "worker.restart": z.object({ workerId: z.string().trim().min(1).max(200).optional() }).strict(),
} as const;

export function validateCapability(capability: string, args: unknown, declared: string[]) {
  if (!declared.includes(capability) || !(capability in commandArguments)) return { ok: false as const, error: "unsupported_capability" };
  const parsed = commandArguments[capability as keyof typeof commandArguments].safeParse(args);
  return parsed.success ? { ok: true as const, arguments: parsed.data } : { ok: false as const, error: "invalid_arguments" };
}

export const resultSchema = z.object({ status: z.enum(["COMPLETED", "FAILED", "REJECTED"]), result: z.record(z.string(), z.unknown()).optional(), reason: z.string().trim().max(1000).optional() }).strict();
export const acknowledgementSchema = z.object({}).strict();

export const transitionMap: Record<string, string[]> = {
  REQUESTED: ["SENT", "REJECTED", "EXPIRED"],
  SENT: ["ACKNOWLEDGED", "COMPLETED", "FAILED", "REJECTED", "EXPIRED"],
  ACKNOWLEDGED: ["COMPLETED", "FAILED", "REJECTED"],
  COMPLETED: [], FAILED: [], REJECTED: [], EXPIRED: [],
};

export function canTransition(from: string, to: string) { return transitionMap[from]?.includes(to) ?? false; }
