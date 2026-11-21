export function isPublicRequest(pathname: string, method: string) {
  if ((method === "GET" || method === "HEAD") && (pathname.startsWith("/_next/") || ["/favicon.ico", "/robots.txt", "/sitemap.xml"].includes(pathname))) return true;
  if (method === "GET" && pathname === "/api/health") return true;
  if (method === "POST" && pathname === "/api/v1/events") return true;
  if (method === "GET" && pathname === "/api/v1/commands/pending") return true;
  if (method === "POST" && /^\/api\/v1\/commands\/[A-Za-z0-9_-]+\/(ack|result)$/.test(pathname)) return true;
  if ((method === "GET" || method === "PATCH") && /^\/api\/v1\/projects\/[A-Za-z0-9_-]+$/.test(pathname)) return true;
  return method === "POST" && /^\/api\/v1\/projects\/[A-Za-z0-9_-]+\/credentials\/rotate$/.test(pathname);
}

export async function credentialsEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([left, right].map(async (value) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))));
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export function decodeBasicCredentials(header: string | null) {
  const match = header?.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) return null;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(match[1]), (value) => value.charCodeAt(0)));
    return decoded.includes(":") ? decoded : null;
  } catch {
    return null;
  }
}
