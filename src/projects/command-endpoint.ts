export function isValidCommandEndpoint(value: string, environment = process.env.NODE_ENV) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && (url.protocol === "https:" || (environment !== "production" && url.protocol === "http:"));
  } catch {
    return false;
  }
}
