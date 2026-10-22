import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jobs/daily-sync", () => ({ runDailySync: vi.fn(async () => ({ canvas: 0, teams: 0, feeds: 0, failed: 0, plans: 0, outOfTime: false })) }));
vi.mock("@/lib/jobs/study-emails", () => ({ sendWeeklyDigests: vi.fn(async () => ({ sent: 0, skipped: 0, outOfTime: false })) }));
import { GET } from "./route";
import { runDailySync } from "@/lib/jobs/daily-sync";

const req = (auth?: string) => new Request("https://therushd.com/api/cron/daily", { headers: auth ? { authorization: auth } : {} });

describe("daily cron endpoint", () => {
  beforeEach(() => vi.mocked(runDailySync).mockClear());

  it("does nothing without a configured secret", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer anything-long-enough"))).status).toBe(401);
    expect(runDailySync).not.toHaveBeenCalled();
  });

  it("requires the exact bearer secret", async () => {
    process.env.CRON_SECRET = "s".repeat(32);
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req(`Bearer ${"s".repeat(31)}x`))).status).toBe(401);
    const ok = await GET(req(`Bearer ${"s".repeat(32)}`));
    expect(ok.status).toBe(200);
    expect(runDailySync).toHaveBeenCalledOnce();
  });
});
