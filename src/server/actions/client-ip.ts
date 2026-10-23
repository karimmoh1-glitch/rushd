import "server-only";
import { headers } from "next/headers";

/** Picks the client address from request headers, trusting only what the
 * current host sets itself:
 * - Vercel overwrites x-real-ip and x-forwarded-for, so either is reliable
 *   there (and a client-sent cf-connecting-ip must be ignored).
 * - Cloudflare sets cf-connecting-ip and only appends to x-forwarded-for, so
 *   there the first x-forwarded-for entry could be forged by the client.
 * - Locally (dev server, e2e) x-forwarded-for is used as given. */
export function clientIpFromHeaders(requestHeaders: Headers, onVercel = Boolean(process.env.VERCEL)): string {
  if (onVercel) {
    const realIp = requestHeaders.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  } else {
    const cloudflareIp = requestHeaders.get("cf-connecting-ip")?.trim();
    if (cloudflareIp) return cloudflareIp;
  }
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor === null) {
    return "local";
  }
  // The first address in the list is the original client.
  return forwardedFor.split(",")[0].trim() || "local";
}

/** The visitor's IP address, used as a rate-limit key. "local" in development. */
export async function getClientIp(): Promise<string> {
  return clientIpFromHeaders(await headers());
}
