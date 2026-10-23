// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const checkRateLimit = vi.fn();
const logEvent = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/auth/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));
vi.mock("@/lib/analytics/log-event", () => ({ logEvent: (...a: unknown[]) => logEvent(...a) }));
vi.mock("@/lib/data-rights/export", () => ({
  exportStream: (userId: string) => new Response(JSON.stringify({ account: { id: userId } })).body,
}));

const { GET } = await import("./route");
const req = (headers: Record<string, string> = {}) => new Request("https://therushd.com/api/account/export", { headers });

describe("GET /api/account/export", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    checkRateLimit.mockReset();
    logEvent.mockReset();
  });

  it("needs a signed-in student", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it("refuses downloads started from another site", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    const res = await GET(req({ "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("is rate limited per student", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });
    const res = await GET(req({ "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("120");
    expect(checkRateLimit).toHaveBeenCalledWith("data-export:u1", expect.objectContaining({ max: 5 }));
  });

  it("streams the signed-in student's own export as an uncached attachment", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    checkRateLimit.mockResolvedValue({ allowed: true });
    const res = await GET(req({ "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="rushd-data-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(await res.json()).toEqual({ account: { id: "u1" } });
    expect(logEvent).toHaveBeenCalledWith("u1", "data_exported");
  });
});
