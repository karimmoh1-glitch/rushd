import { describe, it, expect, vi, beforeEach } from "vitest";

const queryRaw = vi.fn();
vi.mock("@/lib/db", () => ({ db: { $queryRaw: (...args: unknown[]) => queryRaw(...args) } }));

const { GET, HEAD } = await import("./route");
const { pingDatabase } = await import("@/lib/health");

const req = (headers: Record<string, string> = {}) => new Request("https://therushd.com/api/health", { headers });

describe("GET /api/health", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it("is 200, uncached, and reports version and the database check", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const res = await GET(req({ "x-request-id": "uptime-check-0001" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-request-id")).toBe("uptime-check-0001");
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.checks.database.status).toBe("ok");
  });

  it("is 503 when the database errors, without leaking the error", async () => {
    queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED postgres://user:pw@db.internal"));
    const res = await GET(req());
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("postgres://");
    expect(JSON.parse(text).checks.database.status).toBe("error");
  });

  it("times out a hung database quickly", async () => {
    queryRaw.mockReturnValue({ then: () => new Promise(() => {}) });
    const started = Date.now();
    const result = await pingDatabase(50);
    expect(result.status).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("never includes environment secrets", async () => {
    queryRaw.mockResolvedValue([]);
    process.env.SESSION_SECRET = "s".repeat(40);
    const text = await (await GET(req())).text();
    expect(text).not.toContain("s".repeat(40));
    expect(text).not.toMatch(/DATABASE_URL|SESSION_SECRET|sk_live|sk_test/);
  });

  it("answers HEAD with the same status and no body", async () => {
    queryRaw.mockResolvedValue([]);
    const res = await HEAD(req());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
});
