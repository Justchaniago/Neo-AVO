/** Only same-site paths are followed after sign-in. Browsers strip tabs and newlines from URLs, so those are refused. */
export function safeNextPath(value: string | null | undefined) {
  return value && /^\/(?![/\\])[^\\\s\x00-\x1f]*$/.test(value) && !value.startsWith("/login") ? value : "/";
}
