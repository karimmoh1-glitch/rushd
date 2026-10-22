import "server-only";
import { Agent, fetch as undiciFetch } from "undici";
import { CanvasUrlError, normalizeCanvasBaseUrl, resolvePublicAddresses } from "@/lib/canvas/base-url";

// Fetches a student's calendar feed with the same SSRF rules as the Canvas
// API client: the hostname is vetted, DNS is resolved once and the connection
// pinned to those public addresses, redirects are refused, and the body is
// capped.

const MAX_BYTES = 6 * 1024 * 1024;
const USER_AGENT = "Rushd/1.0 (+https://therushd.com)";

export class FeedError extends Error {
  constructor(
    public readonly code: "UNSAFE_URL" | "NOT_FOUND" | "NETWORK" | "TOO_LARGE" | "NOT_CALENDAR",
    message: string,
  ) {
    super(message);
    this.name = "FeedError";
  }
}

export type FetchFeedText = (url: URL) => Promise<string>;

export const fetchFeedText: FetchFeedText = async (url) => {
  let addresses: string[];
  try {
    normalizeCanvasBaseUrl(url.origin);
    addresses = await resolvePublicAddresses(url.origin);
  } catch (error) {
    if (error instanceof CanvasUrlError) throw new FeedError("UNSAFE_URL", error.message);
    throw error;
  }
  let i = 0;
  const dispatcher = new Agent({
    connect: {
      timeout: 8_000,
      lookup: ((_h: string, opts: { all?: boolean }, cb: (err: Error | null, address: unknown, family?: number) => void) => {
        const address = addresses[i++ % addresses.length];
        const family = address.includes(":") ? 6 : 4;
        if (opts?.all) cb(null, [{ address, family }]);
        else cb(null, address, family);
      }) as never,
    },
    headersTimeout: 15_000,
    bodyTimeout: 20_000,
  });
  try {
    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(url.toString(), {
        headers: { Accept: "text/calendar", "User-Agent": USER_AGENT },
        redirect: "manual",
        dispatcher,
      });
    } catch {
      throw new FeedError("NETWORK", "Couldn't reach that calendar. Check the link and try again.");
    }
    if (res.status >= 300 && res.status < 400) throw new FeedError("UNSAFE_URL", "That link redirected somewhere else. Copy it again from Canvas.");
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      throw new FeedError("NOT_FOUND", "Canvas didn't recognize that feed link. Copy it again from Calendar → Calendar Feed.");
    }
    if (!res.ok || !res.body) throw new FeedError("NETWORK", "Canvas didn't return the calendar. Try again in a moment.");

    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.byteLength;
      if (size > MAX_BYTES) throw new FeedError("TOO_LARGE", "That calendar is too large to import.");
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text.includes("BEGIN:VCALENDAR")) throw new FeedError("NOT_CALENDAR", "That link didn't return a calendar.");
    return text;
  } finally {
    await dispatcher.close();
  }
};
