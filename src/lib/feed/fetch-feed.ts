import "server-only";
import { fetch as undiciFetch } from "undici";
import { CanvasUrlError, normalizeCanvasBaseUrl, resolvePublicAddresses } from "@/lib/canvas/base-url";
import { createPinnedAgent } from "@/lib/canvas/client";

// Downloads a student's calendar feed with the same SSRF protections as the
// Canvas API client: the host is checked, the connection is pinned to its
// public addresses, redirects are refused, and the size is capped.

const MAX_BYTES = 6 * 1024 * 1024;
const TOTAL_TIMEOUT_MS = 20_000;
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

/** Checks the feed's host and returns its public addresses. */
async function checkedAddresses(url: URL): Promise<string[]> {
  try {
    normalizeCanvasBaseUrl(url.origin);
    return await resolvePublicAddresses(url.origin);
  } catch (error) {
    if (error instanceof CanvasUrlError) {
      throw new FeedError("UNSAFE_URL", error.message);
    }
    throw error;
  }
}

/** Reads the whole body, stopping as soon as it gets too large. */
async function readBodyWithLimit(body: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > MAX_BYTES) {
        throw new FeedError("TOO_LARGE", "That calendar is too large to import.");
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof FeedError) {
      throw error;
    }
    throw new FeedError("NETWORK", "That calendar took too long to download. Try again in a moment.");
  }
  return Buffer.concat(chunks).toString("utf8");
}

export const fetchFeedText: FetchFeedText = async (url) => {
  const addresses = await checkedAddresses(url);
  const dispatcher = createPinnedAgent(addresses);

  try {
    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(url.toString(), {
        headers: { Accept: "text/calendar", "User-Agent": USER_AGENT },
        redirect: "manual",
        dispatcher,
        // The agent's bodyTimeout only limits the gap between chunks; this limits the whole download.
        signal: AbortSignal.timeout(TOTAL_TIMEOUT_MS),
      });
    } catch {
      throw new FeedError("NETWORK", "Couldn't reach that calendar. Check the link and try again.");
    }

    if (res.status >= 300 && res.status < 400) {
      throw new FeedError("UNSAFE_URL", "That link redirected somewhere else. Copy it again from Canvas.");
    }
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      throw new FeedError("NOT_FOUND", "Canvas didn't recognize that feed link. Copy it again from Calendar → Calendar Feed.");
    }
    if (!res.ok || !res.body) {
      throw new FeedError("NETWORK", "Canvas didn't return the calendar. Try again in a moment.");
    }

    const text = await readBodyWithLimit(res.body);
    if (!text.includes("BEGIN:VCALENDAR")) {
      throw new FeedError("NOT_CALENDAR", "That link didn't return a calendar.");
    }
    return text;
  } finally {
    await dispatcher.close();
  }
};
