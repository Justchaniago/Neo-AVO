/** Only same-site paths are followed after sign-in. */
export function safeNextPath(value: string | null | undefined) {
  return value && /^\/(?![/\\])/.test(value) && !value.startsWith("/login") ? value : "/";
}
