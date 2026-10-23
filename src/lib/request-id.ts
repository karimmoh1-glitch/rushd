// Request IDs tie a student's report ("it failed at 9:14") to the server log
// lines for that request. An incoming X-Request-Id is reused when it looks
// safe (so an upstream proxy or uptime monitor can correlate), otherwise
// Vercel's own x-vercel-id is used, otherwise a fresh random id.
//
// There is deliberately no proxy.ts: Next 16 runs proxy in the Node.js
// runtime, which the Cloudflare Workers build (@opennextjs/cloudflare) can't
// bundle. Route handlers echo the id with withRequestIdHeader(); server actions and
// pages read it with currentRequestId() for their log lines.

export const REQUEST_ID_HEADER = "x-request-id";

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** The id for this request: a safe incoming one, Vercel's, or a new one. */
export function requestIdFrom(headers: Headers): string {
  const incoming = headers.get(REQUEST_ID_HEADER);
  if (incoming && SAFE_ID.test(incoming)) return incoming;
  const vercel = headers.get("x-vercel-id");
  if (vercel && SAFE_ID.test(vercel)) return vercel;
  return crypto.randomUUID();
}

/** For server actions and server components (anything inside a request). */
export async function currentRequestId(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    return requestIdFrom(await headers());
  } catch {
    // Outside a request (scripts, tests).
    return crypto.randomUUID();
  }
}

/** Copies the response with the request id header set. */
export function withRequestIdHeader(response: Response, requestId: string): Response {
  try {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  } catch {
    // Some responses (Response.redirect) have immutable headers.
    const copy = new Response(response.body, response);
    copy.headers.set(REQUEST_ID_HEADER, requestId);
    return copy;
  }
}
