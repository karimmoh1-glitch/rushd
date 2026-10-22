import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicIp } from "./ip-guard";

// Validates a student-supplied Canvas base URL before the server will talk to
// it. Two layers:
//
//  1. Shape (synchronous, also used client-side for instant feedback): https
//     only, a real hostname, no credentials/port/path/query, not an IP
//     literal, not a local-looking name.
//  2. Destination (server-side, async): resolve the hostname and refuse if
//     ANY resulting address is non-public — a name with one public and one
//     private record is still an SSRF vector. The resolved addresses are
//     returned so the HTTP layer can pin the connection to what was checked.
//
// Redirects are never followed by the client (see client.ts), so a public
// host cannot bounce the server somewhere private.

export class CanvasUrlError extends Error {
  constructor(
    public readonly code:
      | "EMPTY"
      | "NOT_URL"
      | "NOT_HTTPS"
      | "HAS_CREDENTIALS"
      | "HAS_PORT"
      | "HAS_PATH"
      | "IP_LITERAL"
      | "LOCAL_NAME"
      | "UNRESOLVABLE"
      | "PRIVATE_ADDRESS",
    message: string,
  ) {
    super(message);
    this.name = "CanvasUrlError";
  }
}

const LOCAL_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet", ".arpa"];

/** Accepts "school.instructure.com", "https://school.instructure.com/",
 * or a pasted deep link, and returns the canonical origin. Throws
 * CanvasUrlError with a user-facing message otherwise. */
export function normalizeCanvasBaseUrl(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) throw new CanvasUrlError("EMPTY", "Enter your school's Canvas address.");

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new CanvasUrlError("NOT_URL", "That doesn't look like a web address.");
  }

  if (url.protocol !== "https:") {
    throw new CanvasUrlError("NOT_HTTPS", "Canvas addresses must start with https://.");
  }
  if (url.username || url.password) {
    throw new CanvasUrlError("HAS_CREDENTIALS", "Remove the username/password from the address.");
  }
  if (url.port) {
    throw new CanvasUrlError("HAS_PORT", "Use the plain Canvas address, without a port number.");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // WHATWG URL parsing already canonicalizes exotic IPv4 forms
  // ("2130706433", "0x7f.1") to dotted quads, so isIP catches them too.
  if (isIP(host.replace(/^\[|\]$/g, "")) !== 0) {
    throw new CanvasUrlError("IP_LITERAL", "Enter Canvas's hostname, not an IP address.");
  }
  if (!host.includes(".")) {
    throw new CanvasUrlError("LOCAL_NAME", "Enter the full address, like school.instructure.com.");
  }
  if (LOCAL_SUFFIXES.some((s) => host.endsWith(s)) || host === "localhost") {
    throw new CanvasUrlError("LOCAL_NAME", "That address isn't reachable from the internet.");
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    throw new CanvasUrlError("NOT_URL", "That hostname contains characters Canvas addresses don't use.");
  }

  // Deep links are fine to paste — we only keep the origin. A path that is
  // clearly not Canvas (e.g. someone pasting a Google Doc) is still allowed;
  // the connection test will give a precise answer.
  void url.pathname;

  return `https://${host}`;
}

export function isLikelyCanvasHost(origin: string): boolean {
  return /instructure\.com$|canvas\./.test(new URL(origin).hostname);
}

/** Resolves the host and insists every address is public. Returns them so
 * the fetch can be pinned to the vetted addresses. */
export async function resolvePublicAddresses(origin: string): Promise<string[]> {
  const host = new URL(origin).hostname;
  let records: { address: string; family: number }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new CanvasUrlError("UNRESOLVABLE", "That address couldn't be found. Check the spelling.");
  }
  if (records.length === 0) {
    throw new CanvasUrlError("UNRESOLVABLE", "That address couldn't be found. Check the spelling.");
  }
  for (const r of records) {
    if (!isPublicIp(r.address)) {
      throw new CanvasUrlError("PRIVATE_ADDRESS", "That address points somewhere Rushd can't connect to.");
    }
  }
  return records.map((r) => r.address);
}
