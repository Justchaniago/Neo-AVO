import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { isValidCommandEndpoint } from "../projects/command-endpoint";

export class CommandEndpointRefused extends Error {
  constructor(reason: string) {
    super(`command_endpoint_refused: ${reason}`);
    this.name = "CommandEndpointRefused";
  }
}

export function isBlockedCommandAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (family !== 6) return true;
  let normalized = address.toLowerCase();
  if (normalized.includes("%")) return true;
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const bytes = normalized.slice(lastColon + 1).split(".").map(Number);
    normalized = `${normalized.slice(0, lastColon)}:${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const [left, right] = normalized.split("::");
  const start = left ? left.split(":") : [];
  const end = right ? right.split(":") : [];
  const words = (right === undefined ? start : [...start, ...Array(8 - start.length - end.length).fill("0"), ...end]).map((word) => parseInt(word, 16));
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return isBlockedCommandAddress(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
  }
  return words.slice(0, 6).every((word) => word === 0) || (words[0] & 0xfe00) === 0xfc00 ||
    (words[0] & 0xffc0) === 0xfe80 || (words[0] & 0xff00) === 0xff00;
}

export function parseCommandEndpoint(value: string, allowPrivate = false) {
  if (!isValidCommandEndpoint(value)) throw new CommandEndpointRefused("invalid_scheme_or_credentials");
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate && isIP(hostname) && isBlockedCommandAddress(hostname)) throw new CommandEndpointRefused("private_or_reserved_address");
  return url;
}

export async function resolveCommandAddresses(hostname: string, allowPrivate = false, resolve = lookup) {
  const family = isIP(hostname);
  const addresses = family ? [{ address: hostname, family }] : await resolve(hostname, { all: true, verbatim: true });
  if (!addresses.length || (!allowPrivate && addresses.some(({ address }) => isBlockedCommandAddress(address)))) {
    throw new CommandEndpointRefused("private_or_reserved_address");
  }
  return addresses;
}

export async function assertSafeCommandEndpoint(value: string, allowPrivate = false, resolve = lookup) {
  const url = parseCommandEndpoint(value, allowPrivate);
  await resolveCommandAddresses(url.hostname.replace(/^\[|\]$/g, ""), allowPrivate, resolve);
}
