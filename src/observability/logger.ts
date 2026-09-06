type Level = "info" | "warn" | "error";

export function log(level: Level, component: string, message: string, fields: Record<string, string | number | boolean | null | undefined> = {}) {
  const safeFields = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, component, message, ...safeFields }));
}
