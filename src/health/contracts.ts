export type BusinessProof = {
  isValidSuccess: boolean;
  isValidFailure: boolean;
  description: string | null;
};

/**
 * Authoritative, project-specific business evidence policy mapping.
 * Ensures Business Health is backed strictly by verified business-level outcomes.
 */
export function evaluateBusinessProof(
  projectSlug: string,
  event: { type: string; data: unknown }
): BusinessProof {
  const data = (event.data && typeof event.data === "object" ? event.data : {}) as Record<string, unknown>;

  if (projectSlug === "auto-email") {
    const isSuccess =
      event.type === "task.completed" &&
      (data.taskType === "export_sales_draft" || Boolean(data.draftId)) &&
      typeof data.draftId === "string" &&
      data.draftId.length > 0;
    const isFailure = event.type === "task.failed";
    const desc = isSuccess
      ? `Gmail draft created (${data.store || "store"}, ID: ${data.draftId})`
      : null;
    return { isValidSuccess: isSuccess, isValidFailure: isFailure, description: desc };
  }

  if (projectSlug === "briefing-agent") {
    const sentCount = typeof data.sent_count === "number" ? data.sent_count : 0;
    const isSuccess =
      (event.type === "task.completed" || event.type === "briefing.completed") &&
      sentCount > 0;
    const isFailure =
      event.type === "task.failed" ||
      (event.type === "task.completed" && sentCount === 0);
    const desc = isSuccess ? `Briefing delivered to Telegram (${sentCount} sent)` : null;
    return { isValidSuccess: isSuccess, isValidFailure: isFailure, description: desc };
  }

  if (projectSlug === "tele-auto") {
    const isSuccess =
      event.type === "tele_auto.run.completed" &&
      (data.executionPhase === "WRITE_CONFIRMED" || data.status === "COMPLETED");
    const isFailure =
      event.type === "tele_auto.run.failed" ||
      event.type === "tele_auto.telegram.delivery_failed" ||
      event.type === "tele_auto.run.effect_uncertain" ||
      event.type === "tele_auto.sheets.schema_mismatch";
    const desc = isSuccess
      ? `Sheets write confirmed (${data.store || "all"} / ${data.domain || "run"})`
      : null;
    return { isValidSuccess: isSuccess, isValidFailure: isFailure, description: desc };
  }

  if (projectSlug === "qra-system") {
    const isSuccess =
      event.type === "qra.resolve_missing_dates.completed" ||
      (event.type === "task.completed" && data.status === "COMPLETED");
    const isFailure =
      event.type === "task.failed" ||
      event.type === "EXPECTED_EXECUTION_MISSED";
    const desc = isSuccess ? "QRA reconciliation / missing dates completed" : null;
    return { isValidSuccess: isSuccess, isValidFailure: isFailure, description: desc };
  }

  // Fallback for generic projects
  const isGenericSuccess =
    event.type === "task.completed" ||
    event.type === "deployment.completed" ||
    event.type === "agent.completed";
  const isGenericFailure =
    event.type === "task.failed" ||
    event.type === "deployment.failed" ||
    event.type === "agent.failed";
  return { isValidSuccess: isGenericSuccess, isValidFailure: isGenericFailure, description: null };
}
