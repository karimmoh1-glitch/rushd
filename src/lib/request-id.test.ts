import { describe, it, expect } from "vitest";
import { requestIdFrom, withRequestIdHeader, REQUEST_ID_HEADER } from "./request-id";

describe("request ids", () => {
  it("reuses a safe incoming id", () => {
    expect(requestIdFrom(new Headers({ "x-request-id": "monitor-abc-12345" }))).toBe("monitor-abc-12345");
  });

  it("ignores unsafe or oversized incoming ids", () => {
    const injected = requestIdFrom(new Headers({ "x-request-id": "bad\nid with spaces <script>" }));
    expect(injected).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdFrom(new Headers({ "x-request-id": "a".repeat(500) }))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("falls back to Vercel's id, then a random one", () => {
    expect(requestIdFrom(new Headers({ "x-vercel-id": "iad1::abcde-1700000000000-0123456789ab" }))).toBe("iad1::abcde-1700000000000-0123456789ab");
    expect(requestIdFrom(new Headers())).not.toBe(requestIdFrom(new Headers()));
  });

  it("echoes the id on responses, including redirects with immutable headers", () => {
    expect(withRequestIdHeader(new Response("ok"), "req-12345678").headers.get(REQUEST_ID_HEADER)).toBe("req-12345678");
    const redirect = withRequestIdHeader(Response.redirect("https://therushd.com/login", 303), "req-12345678");
    expect(redirect.status).toBe(303);
    expect(redirect.headers.get(REQUEST_ID_HEADER)).toBe("req-12345678");
  });
});
