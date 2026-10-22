import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { connectFeed, disconnectFeed, runFeedSync } from "./service";

// Real database and vault; the feed body is scripted (no network).

const URL_OK = "https://canvas.example.edu/feeds/calendars/user_abcDEF1234567890.ics";

function ics(events: { uid: string; summary: string; start: string; url?: string }[]) {
  return [
    "BEGIN:VCALENDAR",
    ...events.flatMap((e) => ["BEGIN:VEVENT", `DTSTART:${e.start}`, `SUMMARY:${e.summary}`, `UID:${e.uid}`, ...(e.url ? [`URL;VALUE=URI:${e.url}`] : []), "END:VEVENT"]),
    "END:VCALENDAR",
  ].join("\r\n");
}

const stamp = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

describe("Canvas calendar feed (real DB, scripted feed)", { timeout: 60_000 }, () => {
  const users: string[] = [];
  afterEach(async () => {
    await Promise.all(users.splice(0).map(deleteTestUser));
  });

  it("imports assignments into classes, updates them, and drops removed ones", async () => {
    const u = await createTestUser({ displayName: "Feed" });
    users.push(u.id);
    let body = ics([
      { uid: "event-assignment-1", summary: "Problem set 4 [MATH 101]", start: stamp(2), url: "https://canvas.example.edu/courses/1/assignments/1" },
      { uid: "event-assignment-2", summary: "Lab writeup [CHEM 110]", start: stamp(4), url: "https://evil.example/x" },
      { uid: "event-assignment-3", summary: "Old essay [ENGL 200]", start: stamp(-40) },
      { uid: "event-calendar-event-9", summary: "Lecture [MATH 101]", start: stamp(1) },
    ]);
    const fetchText = async () => body;

    const first = await connectFeed(u.id, URL_OK, { fetchText });
    expect(first).toMatchObject({ ok: true, value: { created: 2, updated: 0, removed: 0 } });
    const rows = await db.assignment.findMany({ where: { userId: u.id }, include: { class: true }, orderBy: { feedUid: "asc" } });
    expect(rows.map((r) => [r.title, r.class.name, r.source])).toEqual([
      ["Problem set 4", "MATH 101", "CALENDAR"],
      ["Lab writeup", "CHEM 110", "CALENDAR"],
    ]);
    expect(rows[1].canvasUrl).toBeNull();
    const feed = await db.calendarFeed.findUniqueOrThrow({ where: { userId: u.id } });
    expect(feed.encryptedUrl).not.toContain("abcDEF");

    body = ics([{ uid: "event-assignment-1", summary: "Problem set 4 (revised) [MATH 101]", start: stamp(3) }]);
    const second = await runFeedSync(u.id, { fetchText });
    expect(second).toMatchObject({ ok: true, value: { created: 0, updated: 1, removed: 1 } });
    expect((await db.assignment.findFirstOrThrow({ where: { userId: u.id, feedUid: "event-assignment-1" } })).title).toBe("Problem set 4 (revised)");
    expect((await db.assignment.findFirstOrThrow({ where: { userId: u.id, feedUid: "event-assignment-2" } })).canvasRemovedAt).not.toBeNull();

    await disconnectFeed(u.id, false);
    expect(await db.calendarFeed.findUnique({ where: { userId: u.id } })).toBeNull();
    expect(await db.assignment.count({ where: { userId: u.id, source: "MANUAL" } })).toBe(2);
  });

  it("won't connect over a sync that's still running", async () => {
    const u = await createTestUser({ displayName: "Feed3" });
    users.push(u.id);
    await connectFeed(u.id, URL_OK, { fetchText: async () => ics([]) });
    await db.calendarFeed.update({ where: { userId: u.id }, data: { syncStartedAt: new Date() } });
    const r = await connectFeed(u.id, URL_OK, { fetchText: async () => ics([]) });
    expect(r).toMatchObject({ ok: false, code: "IN_PROGRESS" });
  });

  it("refuses links that aren't Canvas feeds and records fetch failures", async () => {
    const u = await createTestUser({ displayName: "Feed2" });
    users.push(u.id);
    const bad = await connectFeed(u.id, "https://example.com/calendar.ics", { fetchText: async () => "BEGIN:VCALENDAR" });
    expect(bad).toMatchObject({ ok: false, code: "BAD_URL" });

    await connectFeed(u.id, URL_OK, { fetchText: async () => ics([]) });
    const failed = await runFeedSync(u.id, {
      fetchText: async () => {
        const { FeedError } = await import("./fetch-feed");
        throw new FeedError("NOT_FOUND", "Canvas didn't recognize that feed link.");
      },
    });
    expect(failed).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await db.calendarFeed.findUniqueOrThrow({ where: { userId: u.id } })).toMatchObject({ status: "ERROR", syncStartedAt: null });
  });
});
