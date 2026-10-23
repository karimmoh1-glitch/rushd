import { describe, it, expect } from "vitest";
import { describeError, formatLogLine } from "./log";

const parse = (line: string) => JSON.parse(line) as Record<string, unknown>;

describe("structured logger", () => {
  it("writes one JSON object with level, event and fields", () => {
    const line = parse(formatLogLine("info", "cron.daily", { requestId: "req-12345678", synced: 3 }, new Date("2026-10-22T09:00:00Z")));
    expect(line).toEqual({ ts: "2026-10-22T09:00:00.000Z", level: "info", event: "cron.daily", requestId: "req-12345678", synced: 3 });
  });

  it("redacts content and secrets by field name, but keeps counts", () => {
    const line = parse(
      formatLogLine("info", "x", {
        message: "my essay about the war",
        draftText: "secret draft",
        accessToken: "abc",
        password: "hunter2",
        email: "kid@example.com",
        authorization: "Bearer x",
        nested: { content: "student text", ok: "fine" },
        messageCount: 4,
        context: "one_thing_helpful",
      }),
    );
    expect(line.message).toBe("[redacted]");
    expect(line.draftText).toBe("[redacted]");
    expect(line.accessToken).toBe("[redacted]");
    expect(line.password).toBe("[redacted]");
    expect(line.email).toBe("[redacted]");
    expect(line.authorization).toBe("[redacted]");
    expect(line.nested).toEqual({ content: "[redacted]", ok: "fine" });
    expect(line.messageCount).toBe(4);
    expect(line.context).toBe("one_thing_helpful");
  });

  it("logs only an error's name and code, never its message", () => {
    const error = Object.assign(new Error("Invalid `db.user.create()` invocation: email kid@example.com"), { code: "P2002" });
    const line = parse(formatLogLine("error", "x", { err: error }));
    expect(line.err).toEqual({ name: "Error", code: "P2002" });
    expect(JSON.stringify(line)).not.toContain("kid@example.com");
    expect(describeError("boom")).toEqual({ name: "string" });
  });

  it("cuts long strings and deep objects", () => {
    const line = parse(formatLogLine("info", "x", { path: "a".repeat(500), deep: { a: { b: { c: { d: 1 } } } } }));
    expect((line.path as string).length).toBeLessThanOrEqual(201);
    expect(JSON.stringify(line.deep)).toContain("[truncated]");
  });
});
