import { describe, it, expect, vi, afterEach } from "vitest";

const cookieValue = vi.hoisted(() => ({ current: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieValue.current ? { value: cookieValue.current } : undefined) }),
}));

import { currentTime, parseTestNow, testClockAllowed } from "./now";

afterEach(() => {
  vi.unstubAllEnvs();
  cookieValue.current = undefined;
});

describe("test clock", () => {
  it("is impossible in production, even with the flag and a cookie", async () => {
    expect(testClockAllowed({ NODE_ENV: "production", RUSHD_TEST_CLOCK: "1" } as NodeJS.ProcessEnv)).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RUSHD_TEST_CLOCK", "1");
    cookieValue.current = "2020-01-01T00:00:00Z";
    expect((await currentTime()).getFullYear()).toBeGreaterThan(2020);
  });

  it("needs the explicit flag outside production", async () => {
    expect(testClockAllowed({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(false);
    expect(testClockAllowed({ NODE_ENV: "development", RUSHD_TEST_CLOCK: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(testClockAllowed({ NODE_ENV: "development", RUSHD_TEST_CLOCK: "1" } as NodeJS.ProcessEnv)).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    cookieValue.current = "2020-01-01T00:00:00Z";
    expect((await currentTime()).getFullYear()).toBeGreaterThan(2020);
  });

  it("pins the time from the cookie when allowed, and ignores junk", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RUSHD_TEST_CLOCK", "1");
    cookieValue.current = "2026-10-22T15:30:00.000Z";
    expect((await currentTime()).toISOString()).toBe("2026-10-22T15:30:00.000Z");
    cookieValue.current = "not a date";
    expect(Math.abs((await currentTime()).getTime() - Date.now())).toBeLessThan(5_000);
    expect(parseTestNow(undefined)).toBeNull();
    expect(parseTestNow("x".repeat(41))).toBeNull();
  });
});
