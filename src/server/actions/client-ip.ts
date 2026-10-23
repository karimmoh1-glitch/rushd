import "server-only";
import { headers } from "next/headers";

/** The visitor's IP address, used as a rate-limit key. "local" in development. */
export async function getClientIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor === null) {
    return "local";
  }
  // The first address in the list is the original client.
  return forwardedFor.split(",")[0].trim();
}
