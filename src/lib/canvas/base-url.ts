import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicIp } from "./ip-guard";

// Checks a Canvas address a student typed in, before the server talks to it.
// 1. Shape: https only, a real hostname, no login/port, not an IP or local name.
// 2. Destination: look up the hostname and refuse it if ANY address is private
//    (one public + one private record is still an SSRF risk). The addresses are
//    returned so the HTTP client can connect to exactly what was checked.
// The client never follows redirects, so a public host can't bounce us somewhere private.

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

const VALID_HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function isLocalName(host: string): boolean {
  if (host === "localhost") {
    return true;
  }
  for (const suffix of LOCAL_SUFFIXES) {
    if (host.endsWith(suffix)) {
      return true;
    }
  }
  return false;
}

/** Accepts "school.instructure.com", "https://school.instructure.com/", or a
 * pasted deep link, and returns just the origin. Throws CanvasUrlError with a
 * message for the student otherwise. */
export function normalizeCanvasBaseUrl(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    throw new CanvasUrlError("EMPTY", "Enter your school's Canvas address.");
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const withScheme = hasScheme ? trimmed : `https://${trimmed}`;

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

  // URL parsing already turns odd IPv4 forms ("2130706433", "0x7f.1") into
  // dotted quads, so isIP catches those too.
  const hostWithoutBrackets = host.replace(/^\[|\]$/g, "");
  if (isIP(hostWithoutBrackets) !== 0) {
    throw new CanvasUrlError("IP_LITERAL", "Enter Canvas's hostname, not an IP address.");
  }
  if (!host.includes(".")) {
    throw new CanvasUrlError("LOCAL_NAME", "Enter the full address, like school.instructure.com.");
  }
  if (isLocalName(host)) {
    throw new CanvasUrlError("LOCAL_NAME", "That address isn't reachable from the internet.");
  }
  if (!VALID_HOSTNAME.test(host)) {
    throw new CanvasUrlError("NOT_URL", "That hostname contains characters Canvas addresses don't use.");
  }

  // Any path in a pasted deep link is dropped; we only keep the origin.
  return `https://${host}`;
}

/** Looks up the host and insists every address is public. Returns the
 * addresses so the request can be pinned to them. */
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

  const addresses: string[] = [];
  for (const record of records) {
    if (!isPublicIp(record.address)) {
      throw new CanvasUrlError("PRIVATE_ADDRESS", "That address points somewhere Rushd can't connect to.");
    }
    addresses.push(record.address);
  }
  return addresses;
}
