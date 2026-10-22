import { describe, it, expect } from "vitest";

process.env.SESSION_SECRET = "test-secret-at-least-16-chars";
const { unsubscribeUrl, verifyUnsubscribe } = await import("./unsubscribe");

describe("unsubscribe links", () => {
  it("verify only for the account they were made for", () => {
    const url = new URL(unsubscribeUrl("https://therushd.com", "user_1"));
    const t = url.searchParams.get("t");
    expect(verifyUnsubscribe("user_1", t)).toBe(true);
    expect(verifyUnsubscribe("user_2", t)).toBe(false);
    expect(verifyUnsubscribe("user_1", "forged")).toBe(false);
    expect(verifyUnsubscribe(null, t)).toBe(false);
  });
});
