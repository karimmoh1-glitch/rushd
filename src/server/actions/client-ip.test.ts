import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const { clientIpFromHeaders } = await import("./client-ip");

describe("client IP for rate limiting", () => {
  it("on Vercel, trusts x-real-ip and ignores a forged cf-connecting-ip", () => {
    const h = new Headers({ "x-real-ip": "198.51.100.7", "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "1.2.3.4, 198.51.100.7" });
    expect(clientIpFromHeaders(h, true)).toBe("198.51.100.7");
  });

  it("on Cloudflare, uses cf-connecting-ip rather than the client-controlled first x-forwarded-for entry", () => {
    const h = new Headers({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "6.6.6.6, 198.51.100.7" });
    expect(clientIpFromHeaders(h, false)).toBe("198.51.100.7");
  });

  it("falls back to x-forwarded-for, then 'local'", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "127.0.0.2" }), false)).toBe("127.0.0.2");
    expect(clientIpFromHeaders(new Headers(), false)).toBe("local");
    expect(clientIpFromHeaders(new Headers(), true)).toBe("local");
  });
});
