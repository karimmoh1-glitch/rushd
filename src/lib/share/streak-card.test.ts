import { describe, it, expect } from "vitest";

process.env.SESSION_SECRET = "test-secret-at-least-16-chars";
const { decodeStreakCard, encodeStreakCard } = await import("./streak-card");

describe("streak share cards", () => {
  it("round-trips and refuses edited numbers", () => {
    const token = encodeStreakCard({ code: "abcdefgh", streak: 12, minutes: 330 });
    expect(decodeStreakCard(token)).toEqual({ code: "abcdefgh", streak: 12, minutes: 330 });
    expect(decodeStreakCard(token.replace("-12-", "-99-"))).toBeNull();
    expect(decodeStreakCard("abcdefgh-12-330-short")).toBeNull();
  });
});
